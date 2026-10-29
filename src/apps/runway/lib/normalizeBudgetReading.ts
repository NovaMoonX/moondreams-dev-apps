import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { createOptionMatcher, toDisplayCase } from '@/utils/optionMatchUtils';
import {
  BILL_FREQUENCIES,
  BUDGET_LIMITS,
  BUDGET_WORDS,
  CALENDAR_PERIODS,
  INCOME_FREQUENCIES,
  LOOKAHEAD_MONTHS,
  MAX_NAME_LENGTH,
} from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';

export type BudgetIncomeKind = (typeof INCOME_FREQUENCIES)[number];
export type BudgetBillRepeat = (typeof BILL_FREQUENCIES)[number];
export type BudgetEnvelopePeriod = (typeof CALENDAR_PERIODS)[number] | 'perPay';

interface BudgetItem {
  name: string;
  /** The document the item was first read in. */
  sourceFile: string;
  /** What the person should know about it: the same item read differently in another document. */
  notes: string[];
}

export interface BudgetIncome extends BudgetItem {
  amountCents: number | null;
  scheduleKind: BudgetIncomeKind | null;
  nextOn: number | null;
  monthDays: number[];
}

export interface BudgetBill extends BudgetItem {
  /** The amount, or the low end of a written range. */
  amountCents: number | null;
  /** The top of a written range; null for an exact amount. */
  highCents: number | null;
  dueOn: number | null;
  dayOfMonth: number | null;
  repeats: BudgetBillRepeat | null;
}

export interface BudgetEnvelope extends BudgetItem {
  amountCents: number | null;
  period: BudgetEnvelopePeriod | null;
}

export interface BudgetGoal extends BudgetItem {
  targetCents: number | null;
  currentCents: number | null;
  targetDate: number | null;
}

export interface BudgetNotRead {
  file: string;
  text: string;
}

/** What the documents hold, settled and merged; every date is UTC midnight and every amount integer cents. */
export interface BudgetReading {
  incomes: BudgetIncome[];
  bills: BudgetBill[];
  envelopes: BudgetEnvelope[];
  goals: BudgetGoal[];
  notRead: BudgetNotRead[];
}

export const EMPTY_BUDGET_READING: BudgetReading = {
  incomes: [],
  bills: [],
  envelopes: [],
  goals: [],
  notRead: [],
};

interface NormalizeOptions {
  /** The names the documents were sent under; an item's source file is one of them. */
  fileNames: readonly string[];
  /** What was read before; its items come first and keep their values. */
  existing?: BudgetReading;
  /** Lines to add to what could not be read, such as a document that was cut short. */
  extraNotRead?: BudgetNotRead[];
  /** What each name the documents were sent under is called on screen, when they differ. */
  shownAs?: Readonly<Record<string, string>>;
  /** Today, so a goal date beyond the planning window can be reported; without it none is. */
  today?: number;
}

type Raw = Record<string, unknown>;

const asRecords = (value: unknown): Raw[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Raw => typeof entry === 'object' && entry !== null,
      )
    : [];

const asText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

/** Shortens to at most `max` characters at a word, never in the middle of one. */
export const cutAtWord = (text: string, max: number) => {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trim();
};

const toName = (value: unknown) => {
  const text = asText(value);
  const cased = /\p{Ll}/u.test(text)
    ? text
    : toDisplayCase(text, { keepAcronyms: true });
  return cutAtWord(cased, MAX_NAME_LENGTH);
};

const toCents = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.round(value) > 0 &&
  Math.round(value) <= BUDGET_LIMITS.maxCents
    ? Math.round(value)
    : null;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const toDate = (value: unknown) => {
  const match = typeof value === 'string' ? DATE.exec(value.trim()) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = Date.UTC(year, month - 1, day);
  const parsed = new Date(date);
  return year >= 2000 &&
    year <= 2100 &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? date
    : null;
};

const toDayOfMonth = (value: unknown) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 31
    ? value
    : null;

const toOneOf = <T extends string>(value: unknown, options: readonly T[]) =>
  options.find((option) => option === value) ?? null;

const toSourceFile = (raw: unknown, fileNames: readonly string[]) => {
  const text = cutAtWord(asText(raw), BUDGET_LIMITS.fileNameChars);
  const lower = text.toLowerCase();
  return (
    fileNames.find((name) => name === text) ??
    fileNames.find((name) => name.toLowerCase() === lower) ??
    (fileNames.length === 1 ? fileNames[0] : null) ??
    (text || fileNames[0] || '')
  );
};

type ToFile = (raw: unknown) => string;

const toBase = (raw: Raw, toFile: ToFile): BudgetItem => ({
  name: toName(raw.name),
  sourceFile: toFile(raw.sourceFile),
  notes: [],
});

const toIncome = (raw: Raw, toFile: ToFile): BudgetIncome => ({
  ...toBase(raw, toFile),
  amountCents: toCents(raw.amountCents),
  scheduleKind: toOneOf(raw.scheduleKind, INCOME_FREQUENCIES),
  nextOn: toDate(raw.nextOn),
  monthDays: Array.isArray(raw.monthDays)
    ? [
        ...new Set(
          raw.monthDays
            .map(toDayOfMonth)
            .filter((day): day is number => day !== null),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, 2)
    : [],
});

const OTHER_CADENCE =
  /year|annual|quarter|semi|half-?year|bi-?monthly|every\s+(\d+|two|three|four|five|six|nine|twelve)\s+months?/i;

/** The cadence words the document wrote when Runway has no repeat for them, or null. */
const getOtherCadence = (raw: Raw) => {
  const written = asText(raw.writtenCadence);
  return OTHER_CADENCE.test(written) ? written.toLowerCase() : null;
};

/** A bill's repeat as the document wrote it: only a monthly cadence, or none written at all, lets a day of the month stand for "monthly". */
const toRepeat = (raw: Raw) => {
  const written = asText(raw.writtenCadence);
  const isOdd =
    getOtherCadence(raw) !== null ||
    (written !== '' &&
      !/month/i.test(written) &&
      toOneOf(raw.repeats, BILL_FREQUENCIES) === null);
  return isOdd
    ? { repeats: null, dayOfMonth: null }
    : {
        repeats: toOneOf(raw.repeats, BILL_FREQUENCIES),
        dayOfMonth: toDayOfMonth(raw.dayOfMonth),
      };
};

const toBill = (raw: Raw, toFile: ToFile): BudgetBill => {
  const low = toCents(raw.lowCents);
  const high = toCents(raw.highCents);
  const isRange = low !== null && high !== null && high > low;
  return {
    ...toBase(raw, toFile),
    amountCents: isRange ? low : (toCents(raw.amountCents) ?? low ?? high),
    highCents: isRange ? high : null,
    dueOn: toDate(raw.dueOn),
    ...toRepeat(raw),
  };
};

const toEnvelope = (raw: Raw, toFile: ToFile): BudgetEnvelope => ({
  ...toBase(raw, toFile),
  amountCents: toCents(raw.amountCents),
  period: toOneOf<BudgetEnvelopePeriod>(raw.period, [
    ...CALENDAR_PERIODS,
    'perPay',
  ]),
});

const toGoal = (raw: Raw, toFile: ToFile): BudgetGoal => ({
  ...toBase(raw, toFile),
  targetCents: toCents(raw.targetCents),
  currentCents: toCents(raw.currentCents),
  targetDate: toDate(raw.targetDate),
});

const matcher = createOptionMatcher<{ name: string }>({
  names: (option) => [option.name],
  foldPlurals: true,
  typos: false,
});

const orElse = <V>(first: V | null, second: V | null) => first ?? second;

/** Adds `incoming` to `kept` item by item, keeping the first ones when the cap is reached and returning the ones left out. The same name in another document is one item: the first document's values stay, a value only the other has is filled in, and a different amount becomes a note on the kept item. */
function mergeItems<T extends BudgetItem>(
  kept: T[],
  incoming: T[],
  getAmount: (item: T) => number | null,
  fill: (kept: T, other: T) => T,
  cap: number,
): { items: T[]; dropped: T[] } {
  const dropped: T[] = [];
  const items = incoming.reduce<T[]>((list, item) => {
    const twin = matcher.match(
      item.name,
      list.filter((entry) => entry.sourceFile !== item.sourceFile),
    ) as T | null;
    if (twin === null) {
      if (list.length < cap) return [...list, item];
      dropped.push(item);
      return list;
    }
    const mine = getAmount(twin);
    const theirs = getAmount(item);
    const note =
      mine !== null && theirs !== null && mine !== theirs
        ? BUDGET_WORDS.alsoIn(item.sourceFile, formatCents(theirs))
        : null;
    const merged = fill(twin, item);
    const notes =
      note === null || merged.notes.includes(note)
        ? merged.notes
        : [...merged.notes, note];
    return list.map((entry) => (entry === twin ? { ...merged, notes } : entry));
  }, kept);
  return { items, dropped };
}

const CUT_LABELS = {
  incomes: 'incomes',
  bills: 'bills',
  envelopes: 'envelopes',
  goals: 'goals',
} as const;

/** Settles what the reader answered into amounts, dates and choices the forms take, cuts names and lists to their caps, and merges what several documents say about one thing. Pure: the same answer always gives the same reading. */
export function normalizeBudgetReading(
  answer: unknown,
  {
    fileNames,
    existing = EMPTY_BUDGET_READING,
    extraNotRead = [],
    shownAs = {},
    today,
  }: NormalizeOptions,
): BudgetReading {
  const raw = (
    typeof answer === 'object' && answer !== null ? answer : {}
  ) as Raw;
  const toFile: ToFile = (value) => {
    const sent = toSourceFile(value, fileNames);
    return shownAs[sent] ?? sent;
  };
  const named = <T extends BudgetItem>(items: T[]) =>
    items.filter((item) => item.name !== '');

  const incomes = mergeItems(
    existing.incomes,
    named(asRecords(raw.incomes).map((entry) => toIncome(entry, toFile))),
    (item) => item.amountCents,
    (kept, other) => ({
      ...kept,
      amountCents: orElse(kept.amountCents, other.amountCents),
      scheduleKind: orElse(kept.scheduleKind, other.scheduleKind),
      nextOn: orElse(kept.nextOn, other.nextOn),
      monthDays: kept.monthDays.length > 0 ? kept.monthDays : other.monthDays,
    }),
    BUDGET_LIMITS.items.incomes,
  );
  const bills = mergeItems(
    existing.bills,
    named(asRecords(raw.bills).map((entry) => toBill(entry, toFile))),
    (item) => item.amountCents,
    (kept, other) => ({
      ...kept,
      ...(kept.amountCents === null
        ? { amountCents: other.amountCents, highCents: other.highCents }
        : {}),
      dueOn: orElse(kept.dueOn, other.dueOn),
      dayOfMonth: orElse(kept.dayOfMonth, other.dayOfMonth),
      repeats: orElse(kept.repeats, other.repeats),
    }),
    BUDGET_LIMITS.items.bills,
  );
  const envelopes = mergeItems(
    existing.envelopes,
    named(asRecords(raw.envelopes).map((entry) => toEnvelope(entry, toFile))),
    (item) => item.amountCents,
    (kept, other) => ({
      ...kept,
      amountCents: orElse(kept.amountCents, other.amountCents),
      period: orElse(kept.period, other.period),
    }),
    BUDGET_LIMITS.items.envelopes,
  );
  const incomingGoals = named(
    asRecords(raw.goals).map((entry) => toGoal(entry, toFile)),
  );
  const goals = mergeItems(
    existing.goals,
    incomingGoals,
    (item) => item.targetCents,
    (kept, other) => ({
      ...kept,
      targetCents: orElse(kept.targetCents, other.targetCents),
      currentCents: orElse(kept.currentCents, other.currentCents),
      targetDate: orElse(kept.targetDate, other.targetDate),
    }),
    BUDGET_LIMITS.items.goals,
  );

  const cutLines = Object.entries({
    incomes,
    bills,
    envelopes,
    goals,
  }).flatMap(([kind, { dropped }]) =>
    dropped.length === 0
      ? []
      : [
          {
            file: dropped[0].sourceFile,
            text: BUDGET_WORDS.cutItems(
              dropped.length,
              CUT_LABELS[kind as keyof typeof CUT_LABELS],
              BUDGET_LIMITS.items[kind as keyof typeof CUT_LABELS],
            ),
          },
        ],
  );
  const lastDay =
    today === undefined ? null : addUtcMonths(today, LOOKAHEAD_MONTHS);
  const farGoals = incomingGoals.flatMap((goal) =>
    lastDay !== null && goal.targetDate !== null && goal.targetDate > lastDay
      ? [
          {
            file: goal.sourceFile,
            text: BUDGET_WORDS.dateTooFar(
              goal.name,
              formatDateUTC(goal.targetDate),
              LOOKAHEAD_MONTHS,
            ),
          },
        ]
      : [],
  );
  const cadenceLines = asRecords(raw.bills).flatMap((entry) => {
    const cadence = getOtherCadence(entry);
    const name = toName(entry.name);
    return cadence === null || name === ''
      ? []
      : [
          {
            file: toFile(entry.sourceFile),
            text: cutAtWord(
              BUDGET_WORDS.cadenceNotPlanned(name, cadence),
              BUDGET_LIMITS.notReadChars,
            ),
          },
        ];
  });
  const notRead = [
    ...existing.notRead,
    ...cutLines,
    ...cadenceLines,
    ...farGoals,
    ...extraNotRead,
    ...asRecords(raw.notRead).flatMap((entry) => {
      const text = cutAtWord(asText(entry.text), BUDGET_LIMITS.notReadChars);
      return text === '' ? [] : [{ file: toFile(entry.file), text }];
    }),
  ].slice(0, BUDGET_LIMITS.notRead);

  return {
    incomes: incomes.items,
    bills: bills.items,
    envelopes: envelopes.items,
    goals: goals.items,
    notRead,
  };
}
