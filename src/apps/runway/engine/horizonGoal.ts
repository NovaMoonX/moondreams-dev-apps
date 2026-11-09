import type {
  Cents,
  DateOnly,
  GoalSealed,
  HorizonCost,
  HorizonSealed,
} from '@apps/runway/types';

import { DAY_MS } from './dates';
import { isSavingFor, planGoalContributions, type PaceDay } from './pace';

/** What a goal holds now and what its plan puts in on each coming income day; the event it feeds reads the balance on a cost's due date from it. */
export interface GoalCover {
  goalId: string;
  heldCents: Cents;
  contributions: readonly { on: DateOnly; cents: Cents }[];
}

type LinkableEvent = {
  id: string;
  horizon: Pick<HorizonSealed, 'goalId' | 'state'>;
};

/** What the goal is projected to hold on `on`: its balance now plus what the plan puts in through that day. */
export const getGoalBalanceAt = (cover: GoalCover, on: DateOnly): Cents =>
  Math.max(0, cover.heldCents) +
  cover.contributions
    .filter((part) => part.on <= on)
    .reduce((sum, part) => sum + part.cents, 0);

/** The open event a goal feeds, or null. A finished or called-off event keeps its link in history but no longer draws from the goal. */
export const getLinkedEventId = (
  goalId: string,
  events: readonly LinkableEvent[],
): string | null =>
  events.find(
    ({ horizon }) => horizon.goalId === goalId && horizon.state === 'open',
  )?.id ?? null;

/** Why a goal cannot be linked to an event, or null when it can: a goal feeds one event, and an event draws from one goal. */
export function getGoalLinkBlock(
  goalId: string,
  eventId: string,
  events: readonly LinkableEvent[],
): 'goalTaken' | 'eventHasGoal' | null {
  const takenBy = getLinkedEventId(goalId, events);
  if (takenBy !== null && takenBy !== eventId) return 'goalTaken';
  const event = events.find(({ id }) => id === eventId);
  return event?.horizon.goalId != null && event.horizon.goalId !== goalId
    ? 'eventHasGoal'
    : null;
}

const NUDGE_MIN_DAYS = 60;
const NUDGE_MAX_DAYS = 365;

/** The day a dated goal starts asking "Know what it'll cost?": a quarter of the time between the day its date was set and the date comes before it, never under 60 days or over a year. */
export function getHorizonNudgeFrom(
  targetDate: DateOnly,
  setOn: DateOnly,
): DateOnly {
  const days = Math.min(
    NUDGE_MAX_DAYS,
    Math.max(NUDGE_MIN_DAYS, ((targetDate - setOn) / DAY_MS) * 0.25),
  );
  return targetDate - Math.round(days * DAY_MS);
}

/** The day the goal's current target date was set: the start of the unbroken run of versions that carry it, so a date changed away and back counts from the change back. Null when no version carries it. */
export function getTargetDateSetOn(
  versions: readonly { effectiveFrom: DateOnly; targetDate: DateOnly | null }[],
  targetDate: DateOnly,
): DateOnly | null {
  const sorted = [...versions].sort(
    (a, b) => b.effectiveFrom - a.effectiveFrom,
  );
  const run = sorted.findIndex((version) => version.targetDate !== targetDate);
  const carrying = run === -1 ? sorted : sorted.slice(0, run);
  return carrying.length === 0
    ? null
    : Math.min(...carrying.map(({ effectiveFrom }) => effectiveFrom));
}

/** Whether to ask a dated goal that no event feeds if it has a cost to plan for: its asking day has come, its date has not passed, and the person has not said "Don't ask again" for this target date. */
export function shouldNudgeHorizon(input: {
  targetDate: DateOnly | null;
  setOn: DateOnly | null;
  today: DateOnly;
  isLinked: boolean;
  dismissedDate: number | undefined;
}): boolean {
  const { targetDate, setOn } = input;
  if (targetDate === null || setOn === null || input.isLinked) return false;
  if (input.dismissedDate === targetDate) return false;
  if (input.today > targetDate) return false;
  return input.today >= getHorizonNudgeFrom(targetDate, setOn);
}

/** The goal's cover for an event: its balance now and what its cadence puts in on the coming income days. A goal that is not being saved for, or takes what is left (`rest`), puts in nothing a day ahead, so its balance now is all the cover says. */
export function getGoalCover(
  goalId: string,
  goal: GoalSealed,
  heldCents: Cents,
  incomeDays: readonly (PaceDay & { on: DateOnly })[],
  priorDays: readonly PaceDay[] = [],
): GoalCover {
  const isPlanned = isSavingFor(goal) && goal.funding.amount.kind !== 'rest';
  return {
    goalId,
    heldCents,
    contributions: isPlanned
      ? planGoalContributions(
          { ...goal, heldCents },
          incomeDays,
          priorDays,
        ).map((part) => ({ on: part.day.on, cents: part.cents }))
      : [],
  };
}

export const getGoalCostId = (goalId: string) => `goal-${goalId}`;

/** The goal's target as the event's first expected cost: named for the goal, once, on the event's day, at exactly the target. */
export const getGoalCost = (
  goal: Pick<GoalSealed, 'name' | 'targetCents'>,
  goalId: string,
  on: DateOnly | null,
): HorizonCost => ({
  id: getGoalCostId(goalId),
  name: goal.name,
  amount: { lowCents: goal.targetCents, highCents: goal.targetCents },
  schedule: { kind: 'once', anchor: on, monthDays: [] },
  ending: { onDate: null, afterCount: null },
  isOutside: false,
  pricedOn: null,
  endsAfter: null,
  becameBillId: null,
  becameBillOn: null,
  priority: null,
  note: null,
});
