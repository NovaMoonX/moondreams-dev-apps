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
 * The month's interest for an account. An approximation: when the account is linked and one reading
 * falls in the month before the interest day and one on or after it (before the next), the rise between
 * them (floored at zero, so it also counts a deposit) replaces the estimate.
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
  const previous = getInterestDay(input.year, input.month - 1, input.interestDay);
  const next = getInterestDay(input.year, input.month + 1, input.interestDay);
  const sorted = [...input.readings].sort((a, b) => a.on - b.on);
  const before = sorted
    .filter((reading) => reading.on >= previous && reading.on < on)
    .at(-1);
  const after = sorted.find((reading) => reading.on >= on && reading.on < next);
  if (input.isLinked && before !== undefined && after !== undefined) {
    return {
      cents: Math.max(0, after.cents - before.cents),
      isActual: true,
      on,
    };
  }
  return {
    cents: estimateMonthlyInterest(input.balanceCents ?? 0, input.apyBps),
    isActual: false,
    on,
  };
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

/** The balance to show for an account that says nothing of the bank: its figure plus this month's estimate once the interest day has passed with no newer reading. */
export function getShownBalance(input: {
  balanceCents: Cents | null;
  balanceOn: DateOnly | null;
  apyBps: number | null;
  interestDay: number | null;
  isLinked: boolean;
  today: DateOnly;
}): { cents: Cents | null; includesInterestCents: Cents } {
  const none = { cents: input.balanceCents, includesInterestCents: 0 };
  if (
    input.balanceCents === null ||
    input.apyBps === null ||
    input.isLinked ||
    input.balanceOn === null
  ) {
    return none;
  }
  const now = new Date(input.today);
  const on = getInterestDay(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    input.interestDay,
  );
  if (input.today < on || input.balanceOn >= on) return none;
  const interest = estimateMonthlyInterest(input.balanceCents, input.apyBps);
  return {
    cents: input.balanceCents + interest,
    includesInterestCents: interest,
  };
}
