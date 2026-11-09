import type { PACE_STATES } from '@apps/runway/constants';
import type {
  Cents,
  DateOnly,
  FundingRule,
  GoalSealed,
  Priority,
  PriorityExtra,
} from '@apps/runway/types';

import { DAY_MS } from './dates';
import { percentOf } from './money';
import { getCalendarCents } from './calendar';
import { selectRuleDays } from './schedule';
import { getPartAsks, splitAcrossParts } from './parts';

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

/** The days a goal's version holds: `from` inclusive, `until` exclusive, null when it holds on. */
export interface PaceWindow {
  from: number;
  until: number | null;
}

const isInWindow = (window: PaceWindow, on: number) =>
  on >= window.from && (window.until === null || on < window.until);

export interface PaceGoal {
  targetCents: Cents;
  targetDate: DateOnly | null;
  /** What the goal holds before any planned day. Zero until a day is confirmed. */
  heldCents: Cents;
  funding: FundingRule;
  /** Needed with extras: the goal's own priority, which the extras sit below. */
  priority?: Priority;
  orderIndex?: number;
  extras?: readonly PriorityExtra[] | null;
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
  /** The date the goal was judged against: the one in force at the end of the days read. */
  targetDate: DateOnly | null;
}

/**
 * What the goal's cadence puts in on each income day it selects, the last one cut to what is left,
 * nothing after the target. A `rest` goal takes what its day then holds, which only the draft
 * knows, so each funded day lists the whole target left as its ceiling.
 */
export function planGoalContributions<D extends PaceDay>(
  goal: Pick<
    PaceGoal,
    | 'targetCents'
    | 'heldCents'
    | 'funding'
    | 'priority'
    | 'orderIndex'
    | 'extras'
  >,
  incomeDays: readonly D[],
  priorDays: readonly PaceDay[] = [],
  window: PaceWindow | null = null,
): { day: D; cents: Cents; shares?: Cents[] }[] {
  const funded = selectRuleDays(goal.funding, incomeDays);
  const calendar = getCalendarCents(goal.funding, funded, priorDays);
  const partAsks =
    goal.priority === undefined
      ? null
      : getPartAsks(
          {
            priority: goal.priority,
            orderIndex: goal.orderIndex ?? 0,
            funding: goal.funding,
            extras: goal.extras,
          },
          funded,
          priorDays,
        );
  const result = funded.reduce<{
    left: Cents;
    parts: { day: D; cents: Cents; shares?: Cents[] }[];
  }>(
    (acc, day) => {
      if (window !== null && !isInWindow(window, day.on)) return acc;
      const isRest = goal.funding.amount.kind === 'rest';
      const asks = partAsks?.(day.dayKey) ?? null;
      const ask = asks
        ? asks.reduce((sum, part) => sum + part, 0)
        : calendar
          ? (calendar.get(day.dayKey) ?? 0)
          : getDayAsk(goal.funding, day);
      const cents = isRest ? acc.left : Math.min(ask, acc.left);
      const entry = asks
        ? { day, cents, shares: splitAcrossParts(asks, cents) }
        : { day, cents };
      return {
        left: isRest ? acc.left : acc.left - cents,
        parts: cents > 0 ? [...acc.parts, entry] : acc.parts,
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

/** The goal as one stretch of the plan: what its version asks while it holds, and whether money goes in. */
export interface PaceStretch extends PaceWindow {
  goal: Omit<PaceGoal, 'heldCents'>;
  isSaving: boolean;
}

/**
 * What the goal puts in on each income day, each day by the stretch in force on it: a stretch that is
 * not saving (paused, not yet started, ended) puts in nothing, and the money put in earlier counts
 * toward a later stretch's target. Also the days the stretches' cadences fund, for reading "ahead".
 */
export function planGoalTimeline<D extends PaceDay>(
  stretches: readonly PaceStretch[],
  heldCents: Cents,
  incomeDays: readonly D[],
  priorDays: readonly PaceDay[] = [],
): {
  contributions: { day: D; cents: Cents; shares?: Cents[] }[];
  fundedDays: D[];
} {
  const result = [...stretches]
    .sort((a, b) => a.from - b.from)
    .reduce<{
      held: Cents;
      contributions: { day: D; cents: Cents; shares?: Cents[] }[];
      fundedDays: D[];
    }>(
      (acc, stretch) => {
        const { funding } = stretch.goal;
        const parts =
          stretch.isSaving && funding.amount.kind !== 'rest'
            ? planGoalContributions(
                { ...stretch.goal, heldCents: acc.held },
                incomeDays,
                priorDays,
                stretch,
              )
            : [];
        return {
          held: acc.held + parts.reduce((sum, part) => sum + part.cents, 0),
          contributions: [...acc.contributions, ...parts],
          fundedDays: [
            ...acc.fundedDays,
            ...(stretch.isSaving
              ? selectRuleDays(funding, incomeDays).filter((day) =>
                  isInWindow(stretch, day.on),
                )
              : []),
          ],
        };
      },
      { held: heldCents, contributions: [], fundedDays: [] },
    );
  return result;
}

/**
 * Where the plan stands against a goal whose version changes over the coming days: each income day
 * puts in what the stretch in force on it asks, and the target and date it is held to are the ones
 * in force at the end (the last stretch). The days the date allows are counted from the day money
 * first goes in.
 */
export function getTimelinePace(
  stretches: readonly PaceStretch[],
  heldCents: Cents,
  incomeDays: readonly PaceDay[],
  priorDays: readonly PaceDay[] = [],
): Pace {
  const last = [...stretches].sort((a, b) => b.from - a.from)[0];
  const date = last.goal.targetDate;
  const remaining = Math.max(0, last.goal.targetCents - heldCents);
  const isComplete = remaining === 0;
  const isFunding = (stretch: PaceStretch) =>
    stretch.isSaving && stretch.goal.funding.cadence.kind !== 'none';
  const starts = stretches.filter(isFunding).map((stretch) => stretch.from);
  const savingFrom = starts.length === 0 ? -Infinity : Math.min(...starts);
  const counted =
    date === null
      ? []
      : incomeDays.filter((day) => day.on <= date && day.on >= savingFrom);
  const isRest = last.goal.funding.amount.kind === 'rest';
  const { contributions, fundedDays } = planGoalTimeline(
    stretches,
    heldCents,
    incomeDays,
    priorDays,
  );
  const planned = contributions.reduce((sum, part) => sum + part.cents, 0);
  const plannedByDateCents = contributions
    .filter((part) => date !== null && part.day.on <= date)
    .reduce((sum, part) => sum + part.cents, 0);
  const fundedByDate =
    date === null ? 0 : fundedDays.filter((day) => day.on <= date).length;
  const reachedOn = contributions.reduce<{
    sum: Cents;
    day: PaceDay | null;
  }>(
    (acc, part) => {
      const sum = acc.sum + part.cents;
      return {
        sum,
        day: acc.day === null && sum >= remaining ? part.day : acc.day,
      };
    },
    { sum: 0, day: null },
  ).day;

  const result: Pace = {
    isComplete,
    remainingCents: remaining,
    dayCount: counted.length,
    neededPerDayCents:
      isComplete || counted.length === 0
        ? null
        : Math.ceil(remaining / counted.length),
    plannedByDateCents,
    reachedOn: !isComplete && planned >= remaining ? reachedOn : null,
    state:
      date === null || isComplete || isRest || !stretches.some(isFunding)
        ? null
        : getState(
            contributions.length,
            plannedByDateCents,
            remaining,
            fundedByDate,
          ),
    targetDate: date,
  };
  return result;
}

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
  return getTimelinePace(
    [{ goal, from: -Infinity, until: null, isSaving: true }],
    goal.heldCents,
    incomeDays,
    priorDays,
  );
}

export type GoalTrack = 'onTrack' | 'behind';

/** A goal money goes into: not paused and not "Not saving for it yet". The one test every goal total and pace line uses. */
export const isSavingFor = (
  goal: Pick<GoalSealed, 'state' | 'funding'>,
): boolean => goal.state !== 'paused' && goal.funding.cadence.kind !== 'none';

/** Whether a goal read over the coming days is on track: null with no date, a complete goal, or no day money goes in. */
export function getTimelineTrack(pace: Pace): GoalTrack | null {
  if (pace.state === null) return null;
  return pace.state === 'behind' ? 'behind' : 'onTrack';
}

/** Whether a goal with a date is on track: null for a goal with no date, a paused or complete one, or one with no pace to measure. */
export function getGoalTrack(
  goal: Pick<GoalSealed, 'state' | 'funding'>,
  pace: Pace,
): GoalTrack | null {
  if (!isSavingFor(goal) || pace.state === null) return null;
  return pace.state === 'behind' ? 'behind' : 'onTrack';
}

const MONTH_MS = (365.25 / 12) * DAY_MS;

/** What a goal needs each month, from `today`, to reach its target by its date; null with no date, a date already past, or nothing left. A date less than a month away asks for what is left. */
export function getMonthlyPaceCents(
  goal: Pick<PaceGoal, 'targetCents' | 'targetDate' | 'heldCents'>,
  today: DateOnly,
): Cents | null {
  const remaining = goal.targetCents - goal.heldCents;
  if (goal.targetDate === null || goal.targetDate < today || remaining <= 0)
    return null;
  const months = Math.max(1, (goal.targetDate - today) / MONTH_MS);
  return Math.ceil(remaining / months);
}
