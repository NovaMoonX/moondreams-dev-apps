import { CUSHION_DAYS, INCOME_END_GAP_DAYS } from '@apps/runway/constants';
import type { Cents, DateOnly, MoneyRange, Stance } from '@apps/runway/types';

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
  | { kind: 'overdue'; on: DateOnly; billId: string; name: string }
  | { kind: 'noIncome'; on: DateOnly; billId: string; name: string }
  | {
      kind: 'short';
      on: DateOnly;
      dayKey: string;
      itemId: string;
      name: string;
      shortBy: Cents;
      isBill: boolean;
    };

export interface LookaheadInput {
  today: DateOnly;
  /** The last day the plan is looked at. */
  horizon: DateOnly;
  /** The coming income days, in order. */
  days: readonly ComingDay[];
  bills: readonly { id: string; name: string; since: DateOnly }[];
  payments: Readonly<Record<string, BillPayment[]>>;
  /** The draft for one day given what the days before it left behind; null when the day has none. */
  draftOf: (day: ComingDay, carry: LookaheadCarry) => LookaheadDraft | null;
}

export interface Lookahead {
  hasBills: boolean;
  /** The last day the plan holds; null when it fails on the first day it looks at. */
  holdsThrough: DateOnly | null;
  /** In date order, an overdue bill first. */
  problems: LookaheadProblem[];
  /** The first problem on each income day, by day key. */
  shortByDay: Record<string, Extract<LookaheadProblem, { kind: 'short' }>>;
  /** The last income day when nothing follows it for a long stretch. */
  incomeEndsOn: DateOnly | null;
}

const EMPTY_CARRY: LookaheadCarry = { funded: {}, added: {} };
const PROBLEM_RANK = { overdue: 0, noIncome: 1, short: 2 } as const;

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

/** A Must that goes unfunded, or a bill that falls due before the next income day and is not set aside in full. */
const findShort = (
  day: ComingDay,
  nextOn: DateOnly,
  result: LookaheadDraft,
): Extract<LookaheadProblem, { kind: 'short' }> | null => {
  const line = result.draft.lines.find(
    (entry) =>
      entry.shortBy > 0 &&
      (entry.tier === 'must' ||
        (entry.bill !== null && entry.bill.dueOn < nextOn)),
  );
  if (!line) return null;
  return {
    kind: 'short',
    on: day.on,
    dayKey: day.dayKey,
    itemId: line.itemId,
    name: result.names[line.itemId]?.name ?? '',
    shortBy: line.shortBy,
    isBill: line.bill !== null,
  };
};

/** The first payment of each bill that is past due and not marked paid, since the bill began to be tracked. */
const findOverdue = (input: LookaheadInput): LookaheadProblem[] =>
  input.bills.flatMap((bill) => {
    const late = (input.payments[bill.id] ?? []).find(
      (payment) =>
        payment.paid === null &&
        payment.dueOn < input.today &&
        payment.dueOn >= bill.since,
    );
    return late
      ? [{ kind: 'overdue', on: late.dueOn, billId: bill.id, name: bill.name }]
      : [];
  });

/** The first payment of each bill with no income day to set it aside before it is due. */
const findNoIncome = (input: LookaheadInput): LookaheadProblem[] =>
  input.bills.flatMap((bill) => {
    const unfunded = (input.payments[bill.id] ?? []).find(
      (payment) =>
        payment.paid === null &&
        payment.dueOn >= input.today &&
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
  }>(
    (acc, day, index) => {
      const result = input.draftOf(day, acc.carry);
      if (!result) return acc;
      const nextOn = days[index + 1]?.on ?? input.horizon + DAY_MS;
      const short = findShort(day, nextOn, result);
      return {
        carry: nextCarry(acc.carry, day, result.draft),
        shorts: short ? [...acc.shorts, short] : acc.shorts,
      };
    },
    { carry: EMPTY_CARRY, shorts: [] },
  );
  const problems = [
    ...findOverdue(input),
    ...findNoIncome(input),
    ...walked.shorts,
  ].sort(
    (a, b) =>
      a.on - b.on ||
      PROBLEM_RANK[a.kind] - PROBLEM_RANK[b.kind] ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const incomeEndsOn = getIncomeEnd(input);
  const first = problems[0] ?? null;
  const getThrough = (): DateOnly | null => {
    if (!first) return incomeEndsOn ?? input.horizon;
    if (first.kind === 'overdue') return null;
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
      walked.shorts.map((short) => [short.dayKey, short]),
    ),
    incomeEndsOn,
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
