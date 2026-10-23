import { PACE_STATE_LABELS, PACE_WORDS } from '@apps/runway/constants';
import type { Pace } from '@apps/runway/engine/pace';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type { GoalSealed } from '@apps/runway/types';

export interface PaceWords {
  /** What it takes, or where the plan reaches the target when there is no date. */
  need: string;
  /** Where the plan stands against it: the state word first when the goal has a date. */
  standing: string;
  stateLabel: string | null;
}

/** A goal's pace line in words: "$300.00 each income day gets you to $1,800.00 by Aug 29." */
export function describePace(goal: GoalSealed, pace: Pace): PaceWords {
  const target = formatCents(goal.targetCents);
  const reached = pace.reachedOn
    ? `The plan reaches it on ${formatDateUTC(pace.reachedOn.on)}.`
    : 'The income days ahead do not reach it.';
  if (pace.isComplete) {
    return {
      need: `${target} is saved.`,
      standing: '',
      stateLabel: PACE_WORDS.completed,
    };
  }
  if (goal.state === 'paused') {
    return { need: '', standing: PACE_WORDS.paused, stateLabel: null };
  }
  if (goal.funding.amount.kind === 'rest') {
    return { need: '', standing: PACE_WORDS.rest, stateLabel: null };
  }
  if (goal.targetDate === null || pace.state === null) {
    return { need: '', standing: reached, stateLabel: null };
  }
  const by = formatDateUTC(goal.targetDate);
  if (pace.neededPerDayCents === null) {
    return {
      need: `No income day comes before ${by}.`,
      standing: `${formatCents(pace.remainingCents)} short.`,
      stateLabel: PACE_STATE_LABELS.behind,
    };
  }
  const need = `${formatCents(pace.neededPerDayCents)} each income day gets you to ${target} by ${by}.`;
  const shortBy = pace.remainingCents - pace.plannedByDateCents;
  const standing =
    pace.state === 'behind'
      ? `The plan puts in ${formatCents(pace.plannedByDateCents)} by then, ${formatCents(shortBy)} short.`
      : reached;
  return { need, standing, stateLabel: PACE_STATE_LABELS[pace.state] };
}
