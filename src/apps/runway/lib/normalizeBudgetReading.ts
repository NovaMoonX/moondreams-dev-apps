import { formatDateUTC } from '@/utils/formatUtils';
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

/** What one document said about an item, kept when another document said something different. */
export interface BudgetVersion<V> {
  sourceFile: string;
  values: V;
}

interface BudgetItem<V> {
  name: string;
  /** The document the item was first read in. */
  sourceFile: string;
  /** Empty, or what each document said when they disagree: the person picks one. */
  versions: BudgetVersion<V>[];
  /** What each document that named it said on its own, before anything was filled in from another. */
  own: BudgetVersion<V>[];
}

export interface IncomeValues {
  amountCents: number | null;
  scheduleKind: BudgetIncomeKind | null;
  nextOn: number | null;
  monthDays: number[];
}

export interface BillValues {
  /** The amount, or the low end of a written range. */
  amountCents: number | null;
  /** The top of a written range; null for an exact amount. */
  highCents: number | null;
  dueOn: number | null;
  dayOfMonth: number | null;
  repeats: BudgetBillRepeat | null;
  /** The cadence the document wrote when Runway has no repeat for it ("yearly"); the amount is kept apart then, since it was for that cadence. */
  writtenCadence: string | null;
  /** The amount the document wrote for that cadence. */
  writtenCents: number | null;
  /** How many months that cadence spans; null when it is not a whole number of them. */
  writtenMonths: number | null;
}

export interface EnvelopeValues {
  amountCents: number | null;
  period: BudgetEnvelopePeriod | null;
}

export interface GoalValues {
  targetCents: number | null;
  currentCents: number | null;
  targetDate: number | null;
  /** What the document says goes toward it each month; goals have no monthly field, so it is only mentioned. */
  monthlyCents: number | null;
}

interface ForName {
  /** What the money takes care of ("Home", "Pets"), or null when the documents don't make it clear. */
  forName: string | null;
  /** One emoji the reader suggests for that purpose, or null; always null when forName is. */
  forEmoji: string | null;
}

export interface BudgetIncome extends BudgetItem<IncomeValues>, IncomeValues {
  /** Who pays it, or null when the documents don't say. */
  payer: string | null;
}
export interface BudgetBill
  extends BudgetItem<BillValues>, BillValues, ForName {}
export interface BudgetEnvelope
  extends BudgetItem<EnvelopeValues>, EnvelopeValues, ForName {}
export interface BudgetGoal extends BudgetItem<GoalValues>, GoalValues {}

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

const toBase = (raw: Raw, toFile: ToFile) => ({
  name: toName(raw.name),
  sourceFile: toFile(raw.sourceFile),
  versions: [],
  own: [],
});

/** A name that is only a savings, investing or priority word names a goal or a priority, never what money is for ("Retirement home" still is one). */
const NOT_A_PURPOSE =
  /^(additional |extra |other |more )?(saving|savings|invest|investing|investment|investments|retirement|goal|goals|must|should|want|wants)$/i;

const toForName = (value: unknown) => {
  const name = toName(value);
  return name === '' || NOT_A_PURPOSE.test(name)
    ? null
    : /^\p{Ll}/u.test(name)
      ? toDisplayCase(name, { keepAcronyms: true, keepMixedCase: true })
      : name;
};

const emojiSegmenter = new Intl.Segmenter();

/** A suggested emoji when it is exactly one emoji (a flag or a joined family counts as one), else null. */
const toForEmoji = (value: unknown, forName: string | null) => {
  if (forName === null || typeof value !== 'string') return null;
  const text = value.trim();
  const isOne = [...emojiSegmenter.segment(text)].length === 1;
  return isOne && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text)
    ? text
    : null;
};

/** A kept item's purpose with its emoji, else the other's, so the emoji stays with the name it was given for. */
const fillFor = (
  kept: { forName: string | null; forEmoji: string | null },
  other: { forName: string | null; forEmoji: string | null },
) =>
  kept.forName === null
    ? { forName: other.forName, forEmoji: other.forEmoji }
    : { forName: kept.forName, forEmoji: kept.forEmoji };

const forNameMatcher = createOptionMatcher({ foldPlurals: true, typos: false });

/** Gives every item that names the same purpose the first spelling seen ("housing" and "Housing " are one name) and the first emoji suggested for it. */
const unifyForNames = <
  T extends { forName: string | null; forEmoji: string | null },
>(
  items: T[],
): T[] => {
  const named = items.reduce<{ labels: string[]; items: T[] }>(
    (state, item) => {
      if (item.forName === null)
        return { ...state, items: [...state.items, item] };
      const label =
        forNameMatcher.match(item.forName, state.labels) ?? item.forName;
      return {
        labels: state.labels.includes(label)
          ? state.labels
          : [...state.labels, label],
        items: [...state.items, { ...item, forName: label }],
      };
    },
    { labels: [], items: [] },
  ).items;
  const emojis = named.reduce<Map<string, string>>(
    (acc, { forName, forEmoji }) =>
      forName === null || forEmoji === null || acc.has(forName)
        ? acc
        : acc.set(forName, forEmoji),
    new Map(),
  );
  return named.map((item) => ({
    ...item,
    forEmoji: item.forName === null ? null : (emojis.get(item.forName) ?? null),
  }));
};

const toIncome = (raw: Raw, toFile: ToFile): BudgetIncome => {
  const payer = toName(raw.payer) || null;
  const scheduleKind = toOneOf(raw.scheduleKind, INCOME_FREQUENCIES);
  const monthDay = toDayOfMonth(raw.dayOfMonth);
  const monthDays = Array.isArray(raw.monthDays)
    ? [
        ...new Set(
          raw.monthDays
            .map(toDayOfMonth)
            .filter((day): day is number => day !== null),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, 2)
    : [];
  return {
    ...toBase(raw, toFile),
    name: toName(raw.name) || (payer ?? ''),
    payer,
    amountCents: toCents(raw.amountCents),
    scheduleKind,
    nextOn: toDate(raw.nextOn),
    monthDays:
      scheduleKind === 'monthly' && monthDay !== null && monthDays.length === 0
        ? [monthDay]
        : monthDays,
  };
};

const OTHER_CADENCE =
  /year|annual|quarter|semi|half-?year|bi-?monthly|twice|thrice|\d+\s*x\b|\b\w+\s+times\b|every\s+(\d+|two|three|four|five|six|nine|twelve)\s+months?/i;

/** The cadence words the document wrote when Runway has no repeat for them, or null. */
const getOtherCadence = (raw: Raw) => {
  const written = asText(raw.writtenCadence);
  return OTHER_CADENCE.test(written) ? written.toLowerCase() : null;
};

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  nine: 9,
  twelve: 12,
};

/** How many months a written cadence spans ("quarterly" is 3), or null when it is not a whole number of them. */
const getCadenceMonths = (words: string) => {
  const every = /every\s+(\d+|[a-z]+)\s+(month|year)s?/.exec(words);
  if (every) {
    const count = Number(every[1]) || NUMBER_WORDS[every[1]] || 0;
    return count > 0 ? count * (every[2] === 'year' ? 12 : 1) : null;
  }
  if (/(twice|two times|2\s*x)\D*(a|per|each)?\s*(year|annual)/.test(words))
    return 6;
  if (/twice|thrice|\d+\s*x\b|\b\w+\s+times\b/.test(words)) return null;
  if (/semi-?\s?(annual|year)|half-?year/.test(words)) return 6;
  if (/semi|bi-?\s?(monthly|annual|year)/.test(words)) return null;
  if (/quarter/.test(words)) return 3;
  if (/year|annual/.test(words)) return 12;
  return null;
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

const toFor = (raw: Raw) => {
  const forName = toForName(raw.forName);
  return { forName, forEmoji: toForEmoji(raw.forEmoji, forName) };
};

const toBill = (raw: Raw, toFile: ToFile): BudgetBill => {
  const low = toCents(raw.lowCents);
  const high = toCents(raw.highCents);
  const isRange = low !== null && high !== null && high > low;
  const writtenCadence = getOtherCadence(raw);
  const isKept = writtenCadence === null;
  return {
    ...toBase(raw, toFile),
    ...toFor(raw),
    amountCents:
      isKept && isRange
        ? low
        : isKept
          ? (toCents(raw.amountCents) ?? low ?? high)
          : null,
    highCents: isKept && isRange ? high : null,
    dueOn: toDate(raw.dueOn),
    ...toRepeat(raw),
    writtenCadence,
    writtenCents: isKept ? null : (toCents(raw.amountCents) ?? low ?? high),
    writtenMonths: isKept ? null : getCadenceMonths(writtenCadence),
  };
};

const toEnvelope = (raw: Raw, toFile: ToFile): BudgetEnvelope => ({
  ...toBase(raw, toFile),
  ...toFor(raw),
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
  monthlyCents: toCents(raw.monthlyCents),
});

const matcher = createOptionMatcher<{ name: string }>({
  names: (option) => [option.name],
  foldPlurals: true,
  typos: false,
});

const orElse = <V>(first: V | null, second: V | null) => first ?? second;

/** Whether two documents gave different values for the same thing: only a value both have can disagree, a value only one has fills the other. */
const isDifferent = <V>(first: V | null, second: V | null) =>
  first !== null && second !== null && first !== second;

const getDueDay = (bill: BillValues) =>
  bill.dayOfMonth ??
  (bill.dueOn === null ? null : new Date(bill.dueOn).getUTCDate());

const incomeDiffers = (a: IncomeValues, b: IncomeValues) =>
  isDifferent(a.amountCents, b.amountCents) ||
  isDifferent(a.scheduleKind, b.scheduleKind) ||
  isDifferent(a.nextOn, b.nextOn) ||
  (a.monthDays.length > 0 &&
    b.monthDays.length > 0 &&
    a.monthDays.join() !== b.monthDays.join());

const billDiffers = (a: BillValues, b: BillValues) =>
  isDifferent(a.amountCents, b.amountCents) ||
  isDifferent(a.highCents, b.highCents) ||
  isDifferent(a.repeats, b.repeats) ||
  isDifferent(a.writtenCadence, b.writtenCadence) ||
  isDifferent(a.writtenCents, b.writtenCents) ||
  isDifferent(a.writtenMonths, b.writtenMonths) ||
  (a.dueOn !== null && b.dueOn !== null
    ? a.dueOn !== b.dueOn
    : isDifferent(getDueDay(a), getDueDay(b)));

const envelopeDiffers = (a: EnvelopeValues, b: EnvelopeValues) =>
  isDifferent(a.amountCents, b.amountCents) || isDifferent(a.period, b.period);

const goalDiffers = (a: GoalValues, b: GoalValues) =>
  isDifferent(a.targetCents, b.targetCents) ||
  isDifferent(a.currentCents, b.currentCents) ||
  isDifferent(a.targetDate, b.targetDate) ||
  isDifferent(a.monthlyCents, b.monthlyCents);

interface MergeKind<T extends BudgetItem<V>, V> {
  /** The values a document gave, without the name and file. */
  pick: (item: T) => V;
  isDifferent: (first: V, second: V) => boolean;
  /** The kept item with what only the other one has filled in. */
  fill: (kept: T, other: T) => T;
  cap: number;
}

/** Adds `incoming` to `kept` item by item, keeping the first ones when the cap is reached and returning the ones left out. The same name in another document is one item: the first document's values stay and a value only the other has is filled in. When the documents give different values for it, each document's version is kept for the person to choose between. */
function mergeItems<T extends BudgetItem<V>, V>(
  kept: T[],
  incoming: T[],
  { pick, isDifferent: differs, fill, cap }: MergeKind<T, V>,
): { items: T[]; dropped: T[] } {
  const dropped: T[] = [];
  const items = incoming.reduce<T[]>((list, item) => {
    const twin = matcher.match(
      item.name,
      list.filter((entry) => entry.sourceFile !== item.sourceFile),
    ) as T | null;
    if (twin === null) {
      if (list.length < cap)
        return [
          ...list,
          {
            ...item,
            own: [{ sourceFile: item.sourceFile, values: pick(item) }],
          },
        ];
      dropped.push(item);
      return list;
    }
    const theirs = pick(item);
    const mine = { sourceFile: item.sourceFile, values: theirs };
    const own = twin.own.some((entry) => entry.sourceFile === item.sourceFile)
      ? twin.own
      : [...twin.own, mine];
    const versions =
      twin.versions.length > 0
        ? twin.versions.some((version) => !differs(version.values, theirs))
          ? twin.versions
          : [...twin.versions, mine]
        : differs(pick(twin), theirs)
          ? [...twin.own, mine].reduce<BudgetVersion<V>[]>(
              (list, entry) =>
                list.some(
                  (kept) =>
                    JSON.stringify(kept.values) ===
                    JSON.stringify(entry.values),
                )
                  ? list
                  : [...list, entry],
              [],
            )
          : [];
    return list.map((entry) =>
      entry === twin ? { ...fill(twin, item), versions, own } : entry,
    );
  }, kept);
  return { items, dropped };
}

/** The same pay in two documents, each on its own day of the month with the same amount, is one pay twice a month ("ESPP" in a 15th and a 30th sheet). */
const joinPayDays = (item: BudgetIncome): BudgetIncome => {
  const [first, second] = item.versions.map(({ values }) => values);
  const isPair =
    item.versions.length === 2 &&
    [first, second].every(
      (values) =>
        values.scheduleKind === 'monthly' && values.monthDays.length === 1,
    ) &&
    first.amountCents === second.amountCents &&
    first.monthDays[0] !== second.monthDays[0];
  return isPair
    ? {
        ...item,
        scheduleKind: 'twiceMonthly',
        nextOn: null,
        monthDays: [first.monthDays[0], second.monthDays[0]].sort(
          (a, b) => a - b,
        ),
        versions: [],
      }
    : item;
};

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
  const named = <T extends { name: string }>(items: T[]) =>
    items.filter((item) => item.name !== '');

  const incomes = mergeItems(
    existing.incomes,
    named(asRecords(raw.incomes).map((entry) => toIncome(entry, toFile))),
    {
      pick: ({ amountCents, scheduleKind, nextOn, monthDays }) => ({
        amountCents,
        scheduleKind,
        nextOn,
        monthDays,
      }),
      isDifferent: incomeDiffers,
      fill: (kept, other) => ({
        ...kept,
        payer: orElse(kept.payer, other.payer),
        amountCents: orElse(kept.amountCents, other.amountCents),
        scheduleKind: orElse(kept.scheduleKind, other.scheduleKind),
        nextOn: orElse(kept.nextOn, other.nextOn),
        monthDays: kept.monthDays.length > 0 ? kept.monthDays : other.monthDays,
      }),
      cap: BUDGET_LIMITS.items.incomes,
    },
  );
  const bills = mergeItems(
    existing.bills,
    named(asRecords(raw.bills).map((entry) => toBill(entry, toFile))),
    {
      pick: ({
        amountCents,
        highCents,
        dueOn,
        dayOfMonth,
        repeats,
        writtenCadence,
        writtenCents,
        writtenMonths,
      }) => ({
        amountCents,
        highCents,
        dueOn,
        dayOfMonth,
        repeats,
        writtenCadence,
        writtenCents,
        writtenMonths,
      }),
      isDifferent: billDiffers,
      fill: (kept, other) =>
        kept.writtenCadence !== null
          ? { ...kept, ...fillFor(kept, other) }
          : {
              ...kept,
              ...fillFor(kept, other),
              ...(kept.amountCents === null
                ? { amountCents: other.amountCents, highCents: other.highCents }
                : {}),
              dueOn: orElse(kept.dueOn, other.dueOn),
              dayOfMonth: orElse(kept.dayOfMonth, other.dayOfMonth),
              repeats: orElse(kept.repeats, other.repeats),
            },
      cap: BUDGET_LIMITS.items.bills,
    },
  );
  const envelopes = mergeItems(
    existing.envelopes,
    named(asRecords(raw.envelopes).map((entry) => toEnvelope(entry, toFile))),
    {
      pick: ({ amountCents, period }) => ({ amountCents, period }),
      isDifferent: envelopeDiffers,
      fill: (kept, other) => ({
        ...kept,
        ...fillFor(kept, other),
        amountCents: orElse(kept.amountCents, other.amountCents),
        period: orElse(kept.period, other.period),
      }),
      cap: BUDGET_LIMITS.items.envelopes,
    },
  );
  const incomingGoals = named(
    asRecords(raw.goals).map((entry) => toGoal(entry, toFile)),
  );
  const goals = mergeItems(existing.goals, incomingGoals, {
    pick: ({ targetCents, currentCents, targetDate, monthlyCents }) => ({
      targetCents,
      currentCents,
      targetDate,
      monthlyCents,
    }),
    isDifferent: goalDiffers,
    fill: (kept, other) => ({
      ...kept,
      targetCents: orElse(kept.targetCents, other.targetCents),
      currentCents: orElse(kept.currentCents, other.currentCents),
      targetDate: orElse(kept.targetDate, other.targetDate),
      monthlyCents: orElse(kept.monthlyCents, other.monthlyCents),
    }),
    cap: BUDGET_LIMITS.items.goals,
  });

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
  const notRead = [
    ...existing.notRead,
    ...cutLines,
    ...farGoals,
    ...extraNotRead,
    ...asRecords(raw.notRead).flatMap((entry) => {
      const text = cutAtWord(asText(entry.text), BUDGET_LIMITS.notReadChars);
      return text === '' ? [] : [{ file: toFile(entry.file), text }];
    }),
  ].slice(0, BUDGET_LIMITS.notRead);

  const unified = unifyForNames([...bills.items, ...envelopes.items]);
  return {
    incomes: incomes.items.map(joinPayDays),
    bills: unified.slice(0, bills.items.length) as BudgetBill[],
    envelopes: unified.slice(bills.items.length) as BudgetEnvelope[],
    goals: goals.items,
    notRead,
  };
}
