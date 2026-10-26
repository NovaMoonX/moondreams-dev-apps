import { useState, type ReactNode } from 'react';

import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  LIFECYCLE_WORDS,
  PACE_STATE_LABELS,
  PACE_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { Pace } from '@apps/runway/engine/pace';
import type { GoalSealed } from '@apps/runway/types';
import { describeFunding } from '@apps/runway/utils/fundingText';

interface GoalRowProps {
  goalId: string;
  goal: GoalSealed;
  pace: Pace;
  /** What the goal holds now. */
  heldCents: number;
  today: number;
  /** A note on the sheet for the figures the pace is built from. */
  basisNote?: ReactNode;
}

/** The pace in a few words: "Ahead, reaches it Oct 29", "Behind, $40.00 short by Nov 25". */
const describePaceShort = (goal: GoalSealed, pace: Pace) => {
  if (pace.isComplete) return PACE_WORDS.completed;
  if (goal.state === 'paused') return LIFECYCLE_WORDS.paused;
  if (goal.funding.amount.kind === 'rest') return 'Takes what is left';
  const reaches = pace.reachedOn
    ? `reaches it ${formatDateUTC(pace.reachedOn.on)}`
    : 'the days ahead do not reach it';
  if (goal.targetDate === null || pace.state === null) {
    return reaches.charAt(0).toUpperCase() + reaches.slice(1);
  }
  if (pace.state === 'behind') {
    const short = pace.remainingCents - pace.plannedByDateCents;
    return `${PACE_STATE_LABELS.behind}, ${formatCents(short)} short by ${formatDateUTC(goal.targetDate)}`;
  }
  return `${PACE_STATE_LABELS[pace.state]}, ${reaches}`;
};

/** A goal in the plan: its name, what it has saved and its target; it opens the goal's sheet. */
function GoalRow({
  goalId,
  goal,
  pace,
  heldCents,
  today,
  basisNote,
}: GoalRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const saved = formatCents(Math.min(heldCents, goal.targetCents));
  const target = formatCents(goal.targetCents);
  const paceLine = describePaceShort(goal, pace);
  const stateWord = pace.isComplete
    ? PACE_WORDS.completed
    : goal.state === 'paused'
      ? LIFECYCLE_WORDS.paused
      : pace.state === null
        ? null
        : PACE_STATE_LABELS[pace.state];
  const detail = stateWord ? `${saved} saved · ${stateWord}` : `${saved} saved`;
  const needed =
    pace.neededPerDayCents !== null && !pace.isComplete
      ? `It takes ${formatCents(pace.neededPerDayCents)} each income day`
      : null;

  return (
    <>
      <ItemRow
        name={goal.name}
        emoji={goal.emoji}
        detail={detail}
        figure={target}
        ariaLabel={`${goal.name}, ${saved} of ${target} saved. ${paceLine}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <ItemSheet
          itemId={goalId}
          kind='goal'
          today={today}
          figureLabel={`Saved of ${target}`}
          figure={saved}
          facts={[
            `${PRIORITY_LABELS[goal.priority]}. ${describeFunding(goal.funding).replace(/^./, (first) => first.toUpperCase())}`,
            paceLine,
            needed,
          ]}
          note={basisNote}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default GoalRow;
