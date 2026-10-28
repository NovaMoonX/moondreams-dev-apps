import {
  HOW_OFTEN_WORDS,
  PACE_STATE_LABELS,
  PACE_WORDS,
} from '@apps/runway/constants';
import type { Pace } from '@apps/runway/engine/pace';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type { GoalSealed } from '@apps/runway/types';

export interface PaceWords {
  /** The state word, for a goal with a date. */
  stateLabel: string | null;
  /** One sentence for where the plan stands against the goal. */
  line: string;
}

/** A goal's pace in one line: what it takes to be there by its date and what the plan does about it. */
export function describePace(goal: GoalSealed, pace: Pace): PaceWords {
  const reached = pace.reachedOn
    ? `The plan reaches it on ${formatDateUTC(pace.reachedOn.on)}.`
    : 'The income days ahead do not reach it.';
  if (pace.isComplete) {
    return { stateLabel: PACE_WORDS.completed, line: '' };
  }
  if (goal.state === 'paused') {
    return { stateLabel: null, line: PACE_WORDS.paused };
  }
  if (goal.funding.cadence.kind === 'none') {
    return { stateLabel: null, line: HOW_OFTEN_WORDS.notBeingAdded };
  }
  if (goal.funding.amount.kind === 'rest') {
    return { stateLabel: null, line: PACE_WORDS.rest };
  }
  if (goal.targetDate === null || pace.state === null) {
    return { stateLabel: null, line: reached };
  }
  const by = formatDateUTC(goal.targetDate);
  if (pace.neededPerDayCents === null) {
    return {
      stateLabel: PACE_STATE_LABELS.behind,
      line: `No income day comes before ${by}; ${formatCents(pace.remainingCents)} is short.`,
    };
  }
  const takes = `It takes ${formatCents(pace.neededPerDayCents)} each income day to be there by ${by}.`;
  const shortBy = pace.remainingCents - pace.plannedByDateCents;
  const standing =
    pace.state === 'behind'
      ? `The plan puts in ${formatCents(pace.plannedByDateCents)} by then, ${formatCents(shortBy)} short.`
      : reached;
  return {
    stateLabel: PACE_STATE_LABELS[pace.state],
    line: `${takes} ${standing}`,
  };
}
