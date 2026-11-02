import { useState } from 'react';

import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ItemRow, { type ItemRowReorder } from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  HOW_OFTEN_WORDS,
  ITEM_SHEET_R2_WORDS,
  LIFECYCLE_WORDS,
  PACE_STATE_LABELS,
  PACE_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { Pace } from '@apps/runway/engine/pace';
import type { GoalSealed } from '@apps/runway/types';
import { describeFundingShort } from '@apps/runway/utils/fundingText';

interface GoalRowProps {
  goalId: string;
  goal: GoalSealed;
  pace: Pace;
  /** What the goal holds now. */
  heldCents: number;
  today: number;
  reorder?: ItemRowReorder;
  isHighlighted?: boolean;
  isFaded?: boolean;
}

/** The pace in a few words: "Ahead, reaches it Oct 29", "Behind, $40.00 short by Nov 25". */
const describePaceShort = (
  goal: GoalSealed,
  pace: Pace,
  savedCents: number,
) => {
  if (pace.isComplete) return PACE_WORDS.completed;
  if (goal.state === 'paused') return LIFECYCLE_WORDS.paused;
  if (goal.funding.cadence.kind === 'none')
    return HOW_OFTEN_WORDS.notBeingAdded;
  if (goal.funding.amount.kind === 'rest') return 'Takes what is left';
  const reaches = pace.reachedOn
    ? `reaches it ${formatDateShortUTC(pace.reachedOn.on)}`
    : 'the days ahead do not reach it';
  if (goal.targetDate !== null && pace.state === 'behind') {
    const short = pace.remainingCents - pace.plannedByDateCents;
    return `${PACE_STATE_LABELS.behind}, ${formatCentsShort(short)} short by ${formatDateShortUTC(goal.targetDate)}`;
  }
  if (goal.targetDate === null || pace.state === null || savedCents === 0) {
    return reaches.charAt(0).toUpperCase() + reaches.slice(1);
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
  reorder,
  isHighlighted = false,
  isFaded = false,
}: GoalRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const savedCents = Math.min(heldCents, goal.targetCents);
  const progress = `${formatCentsShort(savedCents)} of ${formatCentsShort(goal.targetCents)}`;
  const paceLine = describePaceShort(goal, pace, savedCents);
  const funding = describeFundingShort(goal.funding);

  return (
    <>
      <ItemRow
        name={goal.name}
        emoji={goal.emoji}
        detail={paceLine}
        figure={formatCentsShort(savedCents)}
        figureWord={`of ${formatCentsShort(goal.targetCents)}`}
        ariaLabel={`${goal.name}, ${progress} saved. ${paceLine}. Open`}
        onOpen={reorder ? undefined : () => setIsOpen(true)}
        reorder={reorder}
        isHighlighted={isHighlighted}
        isFaded={isFaded}
      />
      {isOpen && (
        <ItemSheet
          itemId={goalId}
          kind='goal'
          today={today}
          figureLabel='Saved'
          figure={formatCents(savedCents)}
          figureSuffix={`of ${formatCentsShort(goal.targetCents)}`}
          fact={
            goal.funding.cadence.kind === 'none'
              ? `${PRIORITY_LABELS[goal.priority]} · ${funding}`
              : `${PRIORITY_LABELS[goal.priority]} · ${funding} · ${paceLine.charAt(0).toLowerCase()}${paceLine.slice(1)}`
          }
          quickChange={{
            label: ITEM_SHEET_R2_WORDS.changeTarget,
            step: 'target',
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default GoalRow;
