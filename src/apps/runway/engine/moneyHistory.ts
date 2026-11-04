import type { Cents, DateOnly } from '@apps/runway/types';

import {
  deriveBalances,
  deriveBalancesBefore,
  type Balances,
  type BalancesInput,
} from './balances';
import {
  closingBefore,
  getMonthStart,
  getNextMonth,
  type ClosingState,
} from './closings';
import { DAY_MS } from './dates';
import type { BillPayment } from './demands';
import type { Lookahead } from './lookahead';

/** What the money stood at on a day: Free to Spend, and all of it (Free to Spend plus what every item and card holds). */
export interface MoneyPoint {
  on: DateOnly;
  freeCents: Cents;
  allCents: Cents;
}

export type MoneyRange = '1m' | '6m' | '1y' | 'all';

export const MONEY_RANGE_DAYS: Record<Exclude<MoneyRange, 'all'>, number> = {
  '1m': 30,
  '6m': 182,
  '1y': 365,
};

const toPoint = (on: DateOnly, balances: Balances): MoneyPoint => ({
  on,
  freeCents: balances.freeToSpendCents,
  allCents: balances.moneyOnHandCents,
});

/** Days apart the window's points are read, so a long range stays a few dozen sums. */
const getStepDays = (spanDays: number) =>
  spanDays <= 45 ? 1 : spanDays <= 200 ? 7 : 14;

/** Today, then every `step` days back to `from`, with `from` itself; oldest first. */
function listSampleDays(from: DateOnly, today: DateOnly, step: number) {
  const count = Math.floor((today - from) / (step * DAY_MS)) + 1;
  const stepped = Array.from(
    { length: Math.max(0, count) },
    (_, index) => today - index * step * DAY_MS,
  );
  const result = [
    ...(stepped.at(-1) === from || from > today ? [] : [from]),
    ...stepped.reverse(),
  ];
  return result;
}

export interface MoneyHistoryInput {
  /** The ledger as the balances read it, at the plan's level. */
  balances: BalancesInput;
  today: DateOnly;
  /** The first day the range shows; the starting day when it is earlier. */
  from: DateOnly;
  /** Where the ledger read in `balances` starts; earlier days come from `closings`. */
  recentFrom: DateOnly;
  /** The month closings before the window, at the plan's level, in any order; only needed when `from` is before `recentFrom`. */
  closings: readonly ClosingState[];
}

/**
 * Where the money stood across a range, oldest first, ending on today's figures: the days in the
 * ledger read are summed as they stood at each day's end, earlier months at each month's end from
 * their closings. Nothing is stored.
 */
export function getMoneyHistory(input: MoneyHistoryInput): MoneyPoint[] {
  const { balances, today } = input;
  const startDate = balances.startDate;
  if (startDate === null) return [];
  const from = Math.max(input.from, startDate);
  const windowFrom = Math.max(from, input.recentFrom);
  const startMoves = balances.moves.filter((move) => move.kind === 'start');
  const atMonthEnd = (state: ClosingState): MoneyPoint => {
    const next = getMonthStart(getNextMonth(state.month));
    return toPoint(
      next - DAY_MS,
      deriveBalances({
        ...balances,
        moves: startMoves,
        records: [],
        purchases: [],
        closing: closingBefore(state, next),
        asOf: next - DAY_MS,
      }),
    );
  };
  const early = [...input.closings]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map(atMonthEnd)
    .filter((point) => point.on >= from && point.on < windowFrom);
  const startPoint =
    startDate >= from && startDate < windowFrom
      ? [
          toPoint(
            startDate,
            deriveBalances({
              ...balances,
              moves: startMoves,
              records: [],
              purchases: [],
              closing: null,
              asOf: startDate,
            }),
          ),
        ]
      : [];
  const step = getStepDays(Math.round((today - from) / DAY_MS));
  const recent = listSampleDays(windowFrom, today, step).map((day) =>
    day === today
      ? toPoint(today, deriveBalances(balances))
      : toPoint(day, deriveBalancesBefore(balances, day + DAY_MS)),
  );
  const result = [...startPoint, ...early, ...recent];
  return result;
}

export interface MoneyProjectionInput {
  today: DateOnly;
  /** Today's figures, where the projection starts. */
  now: MoneyPoint;
  /** The lookahead's walked income days. */
  steps: Lookahead['steps'];
  payments: Readonly<Record<string, readonly BillPayment[]>>;
  /** An unpaid payment due before this day is not counted, as the lookahead does not report it. */
  billsSince: DateOnly;
}

/** How many coming income days the projection runs through; past them the plan's bills and pay are less certain. */
export const PROJECTED_INCOME_DAYS = 2;
const TRAILING_DAYS = 14;

/**
 * Where the plan takes the money from today, oldest first: each income day adds what it brings in (to
 * all of it) and what its draft leaves free (to Free to Spend), and each unpaid bill payment leaves on
 * its due day (one already due leaves tomorrow). It runs through the next two income days, up to the
 * day before the third; nothing is guessed for everyday spending. Empty when no income day is ahead.
 */
export function getMoneyProjection(input: MoneyProjectionInput): MoneyPoint[] {
  const { today, now } = input;
  const tomorrow = today + DAY_MS;
  const ahead = input.steps.map((step) => ({
    ...step,
    on: Math.max(step.on, tomorrow),
  }));
  if (ahead.length === 0) return [];
  const until =
    ahead.length > PROJECTED_INCOME_DAYS
      ? ahead[PROJECTED_INCOME_DAYS].on - DAY_MS
      : (ahead.at(-1)?.on ?? today) + TRAILING_DAYS * DAY_MS;
  const income = ahead
    .filter((step) => step.on <= until)
    .map((step) => ({
      on: step.on,
      free: step.freeCents,
      all: step.moneyCents,
    }));
  const bills = Object.values(input.payments)
    .flat()
    .filter(
      (payment) =>
        payment.paid === null &&
        payment.dueOn >= input.billsSince &&
        payment.dueOn <= until,
    )
    .map((payment) => ({
      on: Math.max(payment.dueOn, tomorrow),
      free: 0,
      all: -payment.totalCents,
    }));
  const byDay = [...income, ...bills].reduce<Map<DateOnly, MoneyPoint>>(
    (sums, event) => {
      const held = sums.get(event.on) ?? {
        on: event.on,
        freeCents: 0,
        allCents: 0,
      };
      sums.set(event.on, {
        on: event.on,
        freeCents: held.freeCents + event.free,
        allCents: held.allCents + event.all,
      });
      return sums;
    },
    new Map(),
  );
  const result = [...byDay.values()]
    .sort((a, b) => a.on - b.on)
    .reduce<MoneyPoint[]>(
      (points, change) => {
        const last = points[points.length - 1];
        const next = {
          on: change.on,
          freeCents: last.freeCents + change.freeCents,
          allCents: last.allCents + change.allCents,
        };
        const before =
          change.on - DAY_MS > last.on
            ? [{ ...last, on: change.on - DAY_MS }]
            : [];
        return [...points, ...before, next];
      },
      [now],
    );
  const last = result[result.length - 1];
  return last.on < until ? [...result, { ...last, on: until }] : result;
}
