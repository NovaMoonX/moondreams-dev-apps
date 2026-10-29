import { formatCents } from '@/utils/moneyUtils';
import { createOptionMatcher, toDisplayCase } from '@/utils/optionMatchUtils';
import {
  BILL_FREQUENCIES,
  BUDGET_LIMITS,
  BUDGET_WORDS,
  CALENDAR_PERIODS,
  INCOME_FREQUENCIES,
  MAX_NAME_LENGTH,
} from '@apps/runway/constants';

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

const toBase = (raw: Raw, fileNames: readonly string[]): BudgetItem => ({
  name: toName(raw.name),
  sourceFile: toSourceFile(raw.sourceFile, fileNames),
  notes: [],
});

const toIncome = (raw: Raw, fileNames: readonly string[]): BudgetIncome => ({
  ...toBase(raw, fileNames),
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

const toBill = (raw: Raw, fileNames: readonly string[]): BudgetBill => {
  const low = toCents(raw.lowCents);
  const high = toCents(raw.highCents);
  const isRange = low !== null && high !== null && high > low;
  return {
    ...toBase(raw, fileNames),
    amountCents: isRange ? low : (toCents(raw.amountCents) ?? low ?? high),
    highCents: isRange ? high : null,
    dueOn: toDate(raw.dueOn),
    dayOfMonth: toDayOfMonth(raw.dayOfMonth),
    repeats: toOneOf(raw.repeats, BILL_FREQUENCIES),
  };
};

const toEnvelope = (
  raw: Raw,
  fileNames: readonly string[],
): BudgetEnvelope => ({
  ...toBase(raw, fileNames),
  amountCents: toCents(raw.amountCents),
  period: toOneOf<BudgetEnvelopePeriod>(raw.period, [
    ...CALENDAR_PERIODS,
    'perPay',
  ]),
});

const toGoal = (raw: Raw, fileNames: readonly string[]): BudgetGoal => ({
  ...toBase(raw, fileNames),
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

/** Adds `incoming` to `kept` item by item. The same name in another document is one item: the first document's values stay, a value only the other has is filled in, and a different amount becomes a note on the kept item. */
function mergeItems<T extends BudgetItem>(
  kept: T[],
  incoming: T[],
  getAmount: (item: T) => number | null,
  fill: (kept: T, other: T) => T,
  cap: number,
): T[] {
  return incoming.reduce<T[]>((list, item) => {
    const twin = matcher.match(
      item.name,
      list.filter((entry) => entry.sourceFile !== item.sourceFile),
    ) as T | null;
    if (twin === null) return list.length >= cap ? list : [...list, item];
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
}

/** Settles what the reader answered into amounts, dates and choices the forms take, cuts names and lists to their caps, and merges what several documents say about one thing. Pure: the same answer always gives the same reading. */
export function normalizeBudgetReading(
  answer: unknown,
  {
    fileNames,
    existing = EMPTY_BUDGET_READING,
    extraNotRead = [],
  }: NormalizeOptions,
): BudgetReading {
  const raw = (
    typeof answer === 'object' && answer !== null ? answer : {}
  ) as Raw;
  const named = <T extends BudgetItem>(items: T[]) =>
    items.filter((item) => item.name !== '');

  const incomes = mergeItems(
    existing.incomes,
    named(asRecords(raw.incomes).map((entry) => toIncome(entry, fileNames))),
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
    named(asRecords(raw.bills).map((entry) => toBill(entry, fileNames))),
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
    named(
      asRecords(raw.envelopes).map((entry) => toEnvelope(entry, fileNames)),
    ),
    (item) => item.amountCents,
    (kept, other) => ({
      ...kept,
      amountCents: orElse(kept.amountCents, other.amountCents),
      period: orElse(kept.period, other.period),
    }),
    BUDGET_LIMITS.items.envelopes,
  );
  const goals = mergeItems(
    existing.goals,
    named(asRecords(raw.goals).map((entry) => toGoal(entry, fileNames))),
    (item) => item.targetCents,
    (kept, other) => ({
      ...kept,
      targetCents: orElse(kept.targetCents, other.targetCents),
      currentCents: orElse(kept.currentCents, other.currentCents),
      targetDate: orElse(kept.targetDate, other.targetDate),
    }),
    BUDGET_LIMITS.items.goals,
  );
  const notRead = [
    ...existing.notRead,
    ...asRecords(raw.notRead).flatMap((entry) => {
      const text = cutAtWord(asText(entry.text), BUDGET_LIMITS.notReadChars);
      return text === ''
        ? []
        : [{ file: toSourceFile(entry.file, fileNames), text }];
    }),
    ...extraNotRead,
  ].slice(0, BUDGET_LIMITS.notRead);

  return { incomes, bills, envelopes, goals, notRead };
}
