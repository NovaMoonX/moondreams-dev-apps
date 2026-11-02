import { CUSHION_DAYS, INCOME_END_GAP_DAYS } from '@apps/runway/constants';
import type {
  Cents,
  DateOnly,
  MoneyRange,
  Priority,
  Stance,
} from '@apps/runway/types';

import type { ComingDay } from './comingDays';
import type { BillPayment } from './demands';
import type { Draft } from './draft';
import { addUtcDays, DAY_MS } from './dates';
import type { FundedDay } from './progress';
import { effectiveStance, pick } from './stance';

/** What the days already walked leave behind for the next one, assuming each was confirmed as drafted and nothing was spent. */
export interface LookaheadCarry {
  /** What each bill was given by the walked days. */
  funded: Record<string, FundedDay[]>;
  /** What each other item (envelope, goal) was given by the walked days. */
  added: Record<string, Cents>;
}

export interface LookaheadDraft {
  draft: Draft;
  names: Record<string, { name: string }>;
}

export type LookaheadProblem =
  | { kind: 'noIncome'; on: DateOnly; billId: string; name: string }
  | {
      kind: 'short';
      on: DateOnly;
      dayKey: string;
      itemId: string;
      name: string;
      shortBy: Cents;
      isBill: boolean;
      tier: Priority;
    };

export interface LookaheadInput {
  today: DateOnly;
  /** The last day the plan is looked at. */
  horizon: DateOnly;
  /** The coming income days, in order. */
  days: readonly ComingDay[];
  bills: readonly {
    id: string;
    name: string;
    since: DateOnly;
    /** No due date yet: the plan sets nothing aside for it. */
    isUndated: boolean;
  }[];
  payments: Readonly<Record<string, BillPayment[]>>;
  /** The draft for one day given what the days before it left behind; null when the day has none. */
  draftOf: (day: ComingDay, carry: LookaheadCarry) => LookaheadDraft | null;
}

export interface Lookahead {
  hasBills: boolean;
  /** The last day the plan holds; null when it fails on the first day it looks at. */
  holdsThrough: DateOnly | null;
  /** In date order. */
  problems: LookaheadProblem[];
  /** The first short line on each income day, by day key. */
  shortByDay: Record<string, Extract<LookaheadProblem, { kind: 'short' }>>;
  /** The soonest income day on which any item's own line is short, whatever its priority, with the draft it was walked from; null when every day covers everything. */
  firstShortDay: {
    dayKey: string;
    on: DateOnly;
    draft: Pick<Draft, 'lines'>;
  } | null;
  /** The last income day when nothing follows it for a long stretch. */
  incomeEndsOn: DateOnly | null;
  /** Bills to pay now: the first unpaid payment of each bill due today or before, soonest first, with how many more unpaid ones fell due after it. They are to-dos, not gaps in the plan, so they are not in `problems`. */
  due: {
    billId: string;
    name: string;
    dueOn: DateOnly;
    isOverdue: boolean;
    laterCount: number;
  }[];
  /** Bills with no due date yet, in the order given. They never stop the plan, so they are not in `problems`. */
  undated: { billId: string; name: string }[];
}

const EMPTY_CARRY: LookaheadCarry = { funded: {}, added: {} };
const PROBLEM_RANK = { noIncome: 0, short: 1 } as const;

const TIER_RANK: Record<Priority, number> = { must: 0, should: 1, want: 2 };
const getTierRank = (problem: LookaheadProblem) =>
  problem.kind === 'short' ? TIER_RANK[problem.tier] : 0;

/** The one order problems are listed in: date, then kind, then priority, then name. */
export function sortProblems(problems: readonly LookaheadProblem[]) {
  const result = [...problems].sort(
    (a, b) =>
      a.on - b.on ||
      PROBLEM_RANK[a.kind] - PROBLEM_RANK[b.kind] ||
      getTierRank(a) - getTierRank(b) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return result;
}

/** Whether two lookaheads say the same to a person: how far the plan holds and every problem. */
export function isSameLookahead(before: Lookahead, after: Lookahead) {
  const key = (look: Lookahead) =>
    JSON.stringify([look.holdsThrough, sortProblems(look.problems)]);
  const result = key(before) === key(after);
  return result;
}

const nextCarry = (
  carry: LookaheadCarry,
  day: ComingDay,
  draft: Draft,
): LookaheadCarry =>
  draft.lines.reduce<LookaheadCarry>((acc, line) => {
    if (line.cents <= 0) return acc;
    if (line.bill !== null) {
      const entry: FundedDay = {
        dayKey: day.dayKey,
        on: day.on,
        cents: line.cents,
      };
      return {
        ...acc,
        funded: {
          ...acc.funded,
          [line.itemId]: [...(acc.funded[line.itemId] ?? []), entry],
        },
      };
    }
    return {
      ...acc,
      added: {
        ...acc.added,
        [line.itemId]: (acc.added[line.itemId] ?? 0) + line.cents,
      },
    };
  }, carry);

/** Every Must that goes unfunded, and every bill that falls due before the next income day and is not set aside in full, in the draft's own order. */
const findShorts = (
  day: ComingDay,
  nextOn: DateOnly,
  result: LookaheadDraft,
): Extract<LookaheadProblem, { kind: 'short' }>[] =>
  result.draft.lines
    .filter(
      (entry) =>
        entry.shortBy > 0 &&
        (entry.tier === 'must' ||
          (entry.bill !== null && entry.bill.dueOn < nextOn)),
    )
    .map((line) => ({
      kind: 'short',
      on: day.on,
      dayKey: day.dayKey,
      itemId: line.itemId,
      name: result.names[line.itemId]?.name ?? '',
      shortBy: line.shortBy,
      isBill: line.bill !== null,
      tier: line.tier,
    }));

/** The first payment of each bill that is due today or past due and not marked paid, since the bill began to be tracked. */
const findDue = (input: LookaheadInput): Lookahead['due'] =>
  input.bills
    .flatMap((bill) => {
      const unpaid = (input.payments[bill.id] ?? []).filter(
        (payment) =>
          payment.paid === null &&
          payment.dueOn <= input.today &&
          payment.dueOn >= bill.since,
      );
      const first = unpaid[0];
      return first
        ? [
            {
              billId: bill.id,
              name: bill.name,
              dueOn: first.dueOn,
              isOverdue: first.dueOn < input.today,
              laterCount: unpaid.length - 1,
            },
          ]
        : [];
    })
    .sort((a, b) => a.dueOn - b.dueOn);

/** The first payment of each bill with no income day to set it aside before it is due. */
const findNoIncome = (input: LookaheadInput): LookaheadProblem[] =>
  input.bills.flatMap((bill) => {
    const unfunded = (input.payments[bill.id] ?? []).find(
      (payment) =>
        payment.paid === null &&
        payment.dueOn > input.today &&
        payment.dueOn <= input.horizon &&
        payment.parts.length === 0 &&
        payment.fundedCents < payment.totalCents,
    );
    return unfunded
      ? [
          {
            kind: 'noIncome',
            on: unfunded.dueOn,
            billId: bill.id,
            name: bill.name,
          },
        ]
      : [];
  });

const getIncomeEnd = (input: LookaheadInput): DateOnly | null => {
  const last = input.days.at(-1);
  if (!last) return null;
  const isOver = input.horizon - last.on > INCOME_END_GAP_DAYS * DAY_MS;
  return isOver ? last.on : null;
};

/**
 * Walks the coming income days in order, each drafted as if the days before it were confirmed as
 * drafted and nothing was spent, and says how far the plan holds and what stops it. Pure: the draft
 * for a day comes from the caller.
 */
export function lookahead(input: LookaheadInput): Lookahead {
  const { days } = input;
  const walked = days.reduce<{
    carry: LookaheadCarry;
    shorts: Extract<LookaheadProblem, { kind: 'short' }>[];
    firstShortDay: Lookahead['firstShortDay'];
  }>(
    (acc, day, index) => {
      const result = input.draftOf(day, acc.carry);
      if (!result) return acc;
      const nextOn = days[index + 1]?.on ?? input.horizon + DAY_MS;
      const isShort = result.draft.lines.some(
        (line) => line.pairing === null && line.shortBy > 0,
      );
      return {
        carry: nextCarry(acc.carry, day, result.draft),
        shorts: [...acc.shorts, ...findShorts(day, nextOn, result)],
        firstShortDay:
          acc.firstShortDay ??
          (isShort
            ? { dayKey: day.dayKey, on: day.on, draft: result.draft }
            : null),
      };
    },
    { carry: EMPTY_CARRY, shorts: [], firstShortDay: null },
  );
  const problems = sortProblems([...findNoIncome(input), ...walked.shorts]);
  const incomeEndsOn = getIncomeEnd(input);
  const first = problems[0] ?? null;
  const getThrough = (): DateOnly | null => {
    if (!first) return incomeEndsOn ?? input.horizon;
    if (first.kind === 'noIncome') {
      const day = addUtcDays(first.on, -1);
      return day >= input.today ? day : null;
    }
    const before = days.filter((entry) => entry.on < first.on).at(-1);
    return before?.on ?? null;
  };
  const result: Lookahead = {
    hasBills: input.bills.length > 0,
    holdsThrough: getThrough(),
    problems,
    shortByDay: Object.fromEntries(
      problems
        .filter(
          (problem): problem is Extract<LookaheadProblem, { kind: 'short' }> =>
            problem.kind === 'short',
        )
        .reverse()
        .map((short) => [short.dayKey, short]),
    ),
    firstShortDay: walked.firstShortDay,
    incomeEndsOn,
    due: findDue(input),
    undated: input.bills
      .filter((bill) => bill.isUndated)
      .map((bill) => ({ billId: bill.id, name: bill.name })),
  };
  return result;
}

export interface StanceCushion {
  cents: Cents;
  sourceCount: number;
  billCount: number;
}

/**
 * What the plan's stance holds back over the next `CUSHION_DAYS`: for every range in play, the
 * difference between the figure the stance plans and the middle of the range. Null when the stance
 * holds nothing back (middle, optimistic or no ranges).
 */
export function getStanceCushion(
  planStance: Stance,
  today: DateOnly,
  days: readonly Pick<
    ComingDay,
    'on' | 'sourceId' | 'payLineId' | 'amount' | 'stanceOverride'
  >[],
  payments: Readonly<Record<string, BillPayment[]>>,
): StanceCushion | null {
  const end = today + CUSHION_DAYS * DAY_MS;
  const middleOf = (range: MoneyRange) =>
    Math.floor((range.lowCents + range.highCents) / 2);
  const incomes = days
    .filter((day) => day.on <= end)
    .map((day) => {
      const stance = effectiveStance(planStance, day.stanceOverride);
      return {
        key: day.sourceId ?? day.payLineId,
        cents: middleOf(day.amount) - pick(stance, day.amount, 'income'),
      };
    })
    .filter((entry) => entry.cents > 0);
  const bills = Object.entries(payments)
    .flatMap(([billId, list]) =>
      list
        .filter(
          (payment) =>
            payment.paid === null &&
            payment.ranged !== null &&
            payment.dueOn >= today &&
            payment.dueOn <= end,
        )
        .map((payment) => ({
          key: billId,
          cents:
            payment.totalCents -
            middleOf(payment.ranged?.range ?? { lowCents: 0, highCents: 0 }),
        })),
    )
    .filter((entry) => entry.cents > 0);
  const cents = [...incomes, ...bills].reduce((sum, e) => sum + e.cents, 0);
  if (cents <= 0) return null;
  const result: StanceCushion = {
    cents,
    sourceCount: new Set(incomes.map((entry) => entry.key)).size,
    billCount: new Set(bills.map((entry) => entry.key)).size,
  };
  return result;
}
