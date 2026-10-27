import type { PACE_STATES } from '@apps/runway/constants';
import type { Cents, DateOnly, FundingRule } from '@apps/runway/types';

import { percentOf } from './money';
import { getCalendarCents } from './calendar';
import { selectRuleDays } from './schedule';

/** What one funded day asks of an exact or percentage goal; a `rest` goal's ask is not known ahead. */
const getDayAsk = (funding: FundingRule, day: PaceDay) => {
  const { amount } = funding;
  if (funding.cadence.kind === 'none') return 0;
  if (amount.kind === 'exact') return amount.cents;
  const result =
    amount.kind === 'percent' ? percentOf(day.moneyCents ?? 0, amount.bps) : 0;
  return result;
};

export type PaceState = (typeof PACE_STATES)[number];

export interface PaceDay {
  dayKey: string;
  on: number;
  sourceId?: string | null;
  /** The day's money, which a percentage reads; a day without it asks nothing. */
  moneyCents?: Cents;
}

export interface PaceGoal {
  targetCents: Cents;
  targetDate: DateOnly | null;
  /** What the goal holds before any planned day. Zero until a day is confirmed. */
  heldCents: Cents;
  funding: FundingRule;
}

export interface Pace {
  isComplete: boolean;
  remainingCents: Cents;
  /** Income days through the date; 0 when the goal has no date. */
  dayCount: number;
  /** What each income day through the date must put in; null with no date, no such day or nothing left. */
  neededPerDayCents: Cents | null;
  /** What the plan puts in through the date. */
  plannedByDateCents: Cents;
  /** The income day the plan reaches the target on; null when the coming days never do. */
  reachedOn: PaceDay | null;
  /** Null when the goal has no date or is complete. */
  state: PaceState | null;
}

/**
 * What the goal's cadence puts in on each income day it selects, the last one cut to what is left,
 * nothing after the target. A `rest` goal takes what its day then holds, which only the draft
 * knows, so each funded day lists the whole target left as its ceiling.
 */
export function planGoalContributions<D extends PaceDay>(
  goal: Pick<PaceGoal, 'targetCents' | 'heldCents' | 'funding'>,
  incomeDays: readonly D[],
  priorDays: readonly PaceDay[] = [],
): { day: D; cents: Cents }[] {
  const funded = selectRuleDays(goal.funding, incomeDays);
  const calendar = getCalendarCents(goal.funding, funded, priorDays);
  const result = funded.reduce<{
    left: Cents;
    parts: { day: D; cents: Cents }[];
  }>(
    (acc, day) => {
      const isRest = goal.funding.amount.kind === 'rest';
      const cents = isRest
        ? acc.left
        : Math.min(
            calendar
              ? (calendar.get(day.dayKey) ?? 0)
              : getDayAsk(goal.funding, day),
            acc.left,
          );
      return {
        left: isRest ? acc.left : acc.left - cents,
        parts: cents > 0 ? [...acc.parts, { day, cents }] : acc.parts,
      };
    },
    { left: Math.max(0, goal.targetCents - goal.heldCents), parts: [] },
  ).parts;
  return result;
}

/** Behind when the plan falls short by the date, else ahead when funded days are left over once the target is reached. */
const getState = (
  contributionCount: number,
  plannedByDate: Cents,
  remaining: Cents,
  fundedByDate: number,
): PaceState => {
  if (plannedByDate < remaining) return 'behind';
  return fundedByDate > contributionCount ? 'ahead' : 'onPace';
};

/**
 * What it takes per income day to reach a goal by its date, and where the plan stands against that.
 * Ahead means the target is reached at least one funded day before the date, on pace means on the
 * last funded day that fits, behind means the date comes first.
 */
export function getPace(
  goal: PaceGoal,
  incomeDays: readonly PaceDay[],
  priorDays: readonly PaceDay[] = [],
): Pace {
  const remaining = Math.max(0, goal.targetCents - goal.heldCents);
  const isComplete = remaining === 0;
  const date = goal.targetDate;
  const counted =
    date === null ? [] : incomeDays.filter((day) => day.on <= date);
  const isRest = goal.funding.amount.kind === 'rest';
  const contributions = isRest
    ? []
    : planGoalContributions(goal, incomeDays, priorDays);
  const planned = contributions.reduce((sum, part) => sum + part.cents, 0);
  const plannedByDateCents = contributions
    .filter((part) => date !== null && part.day.on <= date)
    .reduce((sum, part) => sum + part.cents, 0);
  const funded = selectRuleDays(goal.funding, incomeDays);
  const fundedByDate =
    date === null ? 0 : funded.filter((day) => day.on <= date).length;

  const result: Pace = {
    isComplete,
    remainingCents: remaining,
    dayCount: counted.length,
    neededPerDayCents:
      isComplete || counted.length === 0
        ? null
        : Math.ceil(remaining / counted.length),
    plannedByDateCents,
    reachedOn:
      !isComplete && planned >= remaining
        ? (contributions[contributions.length - 1]?.day ?? null)
        : null,
    state:
      date === null ||
      isComplete ||
      isRest ||
      goal.funding.cadence.kind === 'none'
        ? null
        : getState(
            contributions.length,
            plannedByDateCents,
            remaining,
            fundedByDate,
          ),
  };
  return result;
}
