import { allocate } from '@apps/runway/engine/money';
import { daysInUtcMonth } from '@apps/runway/engine/dates';
import type { Cents, DateOnly } from '@apps/runway/types';

/** A balance someone or the bank reported for an account, on a day. */
export interface BalanceReading {
  on: DateOnly;
  cents: Cents;
}

export interface MonthInterest {
  cents: Cents;
  /** True when two readings around the interest day worked it out, false for the APY estimate. */
  isActual: boolean;
  on: DateOnly;
}

/** A month's interest at an APY on a balance: `balance * apy / 12`, half up; none for a balance at or below zero or no APY. */
export function estimateMonthlyInterest(
  balanceCents: Cents,
  apyBps: number | null,
): Cents {
  if (apyBps === null || balanceCents <= 0) return 0;
  const result = Math.round((balanceCents * apyBps) / 120_000);
  return result;
}

/** The day interest lands in a month (month 0 to 11): the account's day, or the last day when none is set or the month is shorter. */
export function getInterestDay(
  year: number,
  month: number,
  interestDay: number | null,
): DateOnly {
  const last = daysInUtcMonth(year, month);
  const result = Date.UTC(
    year,
    month,
    interestDay === null ? last : Math.min(Math.max(interestDay, 1), last),
  );
  return result;
}

/**
 * The month's interest. An approximation: for a linked account with a reading in the month before the interest day
 * and one on or after it, their rise replaces the estimate unless it is over twice the estimate (a deposit, not interest).
 */
export function getMonthInterest(input: {
  balanceCents: Cents | null;
  apyBps: number | null;
  interestDay: number | null;
  isLinked: boolean;
  readings: readonly BalanceReading[];
  year: number;
  month: number;
}): MonthInterest {
  const on = getInterestDay(input.year, input.month, input.interestDay);
  const previous = getInterestDay(
    input.year,
    input.month - 1,
    input.interestDay,
  );
  const next = getInterestDay(input.year, input.month + 1, input.interestDay);
  const sorted = [...input.readings].sort((a, b) => a.on - b.on);
  const before = sorted
    .filter((reading) => reading.on >= previous && reading.on < on)
    .at(-1);
  const after = sorted.find((reading) => reading.on >= on && reading.on < next);
  const estimate = estimateMonthlyInterest(
    input.balanceCents ?? 0,
    input.apyBps,
  );
  const rise =
    before === undefined || after === undefined
      ? null
      : Math.max(0, after.cents - before.cents);
  if (input.isLinked && rise !== null && rise <= estimate * 2) {
    return { cents: rise, isActual: true, on };
  }
  return { cents: estimate, isActual: false, on };
}

const REST_ID = '￿';

/** Shares an account's interest between the goals it holds and the rest of the account, by what each holds (the rest from the plan's balance, not the bank's); the shares and the rest add up to the total to the cent. */
export function shareInterest(
  totalCents: Cents,
  goals: readonly { id: string; heldCents: Cents }[],
  accountBalanceCents: Cents | null,
): { byId: Record<string, Cents>; restCents: Cents } {
  const held = goals.map((goal) => Math.max(0, goal.heldCents));
  const rest = Math.max(
    0,
    (accountBalanceCents ?? 0) - held.reduce((sum, cents) => sum + cents, 0),
  );
  const weights = [...held, rest];
  if (weights.every((weight) => weight === 0)) {
    return {
      byId: Object.fromEntries(goals.map((g) => [g.id, 0])),
      restCents: totalCents,
    };
  }
  const shares = allocate(totalCents, weights, [
    ...goals.map((goal) => goal.id),
    REST_ID,
  ]);
  return {
    byId: Object.fromEntries(goals.map((goal, i) => [goal.id, shares[i]])),
    restCents: shares[goals.length],
  };
}

/**
 * Interest an unlinked account's typed balance has not counted yet: one estimate per interest day after the
 * balance's date up to today, and the latest such day; null once the balance is updated or none has passed.
 */
export function getUncountedInterest(input: {
  balanceCents: Cents | null;
  balanceOn: DateOnly | null;
  apyBps: number | null;
  interestDay: number | null;
  isLinked: boolean;
  today: DateOnly;
}): { cents: Cents; on: DateOnly } | null {
  const { balanceCents, balanceOn, apyBps, interestDay } = input;
  if (balanceCents === null || balanceOn === null || apyBps === null) {
    return null;
  }
  if (input.isLinked) return null;
  const from = new Date(balanceOn);
  const now = new Date(input.today);
  const span =
    (now.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    from.getUTCMonth();
  const days = Array.from({ length: span + 1 }, (_, i) =>
    getInterestDay(from.getUTCFullYear(), from.getUTCMonth() + i, interestDay),
  ).filter((on) => on > balanceOn && on <= input.today);
  const cents = estimateMonthlyInterest(balanceCents, apyBps) * days.length;
  if (days.length === 0 || cents === 0) return null;
  return { cents, on: days[days.length - 1] };
}
