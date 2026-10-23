import type { PACE_STATES } from '@apps/runway/constants';
import type { Cents, DateOnly, FundingRule } from '@apps/runway/types';

import { selectFundedDays } from './schedule';

export type PaceState = (typeof PACE_STATES)[number];

export interface PaceDay {
  dayKey: string;
  on: number;
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

/** What the goal's cadence puts in on each income day it selects, the last one cut to what is left, nothing after the target. */
export function planGoalContributions<D extends PaceDay>(
  goal: Pick<PaceGoal, 'targetCents' | 'heldCents' | 'funding'>,
  incomeDays: readonly D[],
): { day: D; cents: Cents }[] {
  const funded = selectFundedDays(goal.funding.cadence, incomeDays);
  const result = funded.reduce<{
    left: Cents;
    parts: { day: D; cents: Cents }[];
  }>(
    (acc, day) => {
      const cents = Math.min(goal.funding.amount.cents, acc.left);
      return {
        left: acc.left - cents,
        parts: cents > 0 ? [...acc.parts, { day, cents }] : acc.parts,
      };
    },
    { left: Math.max(0, goal.targetCents - goal.heldCents), parts: [] },
  ).parts;
  return result;
}

const getState = (
  remaining: Cents,
  amount: Cents,
  fundedByDate: number,
): PaceState => {
  const needed = amount > 0 ? Math.ceil(remaining / amount) : Infinity;
  if (fundedByDate < needed) return 'behind';
  return fundedByDate === needed ? 'onPace' : 'ahead';
};

/**
 * What it takes per income day to reach a goal by its date, and where the plan stands against that.
 * Ahead means the target is reached at least one funded day before the date, on pace means on the
 * last funded day that fits, behind means the date comes first.
 */
export function getPace(goal: PaceGoal, incomeDays: readonly PaceDay[]): Pace {
  const remaining = Math.max(0, goal.targetCents - goal.heldCents);
  const isComplete = remaining === 0;
  const date = goal.targetDate;
  const counted =
    date === null ? [] : incomeDays.filter((day) => day.on <= date);
  const contributions = planGoalContributions(goal, incomeDays);
  const planned = contributions.reduce((sum, part) => sum + part.cents, 0);
  const funded = selectFundedDays(goal.funding.cadence, incomeDays);
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
    plannedByDateCents: contributions
      .filter((part) => date !== null && part.day.on <= date)
      .reduce((sum, part) => sum + part.cents, 0),
    reachedOn:
      !isComplete && planned >= remaining
        ? (contributions[contributions.length - 1]?.day ?? null)
        : null,
    state:
      date === null || isComplete
        ? null
        : getState(remaining, goal.funding.amount.cents, fundedByDate),
  };
  return result;
}
