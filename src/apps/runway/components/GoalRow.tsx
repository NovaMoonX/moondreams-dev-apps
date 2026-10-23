import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import type { Pace } from '@apps/runway/engine/pace';
import type { GoalSealed } from '@apps/runway/types';
import { describeFunding } from '@apps/runway/utils/fundingText';
import { describePace } from '@apps/runway/utils/paceText';

interface GoalRowProps {
  goal: GoalSealed;
  pace: Pace;
}

/** A goal in the plan: its name and target, how it is funded, and the pace line. */
function GoalRow({ goal, pace }: GoalRowProps) {
  const words = describePace(goal, pace);
  const dateText =
    goal.targetDate === null ? '' : ` · by ${formatDateUTC(goal.targetDate)}`;

  return (
    <li className='flex items-start gap-3 p-3'>
      <ItemBadge name={goal.name} emoji={goal.emoji} />
      <div className='min-h-10 min-w-0 flex-1'>
        <div className='flex min-h-10 items-start justify-between gap-2'>
          <p className='line-clamp-2 min-w-0 pt-2 font-medium break-words'>
            {goal.name}
          </p>
          <p className='shrink-0 pt-2 font-semibold whitespace-nowrap tabular-nums'>
            {formatCents(goal.targetCents)}
          </p>
        </div>
        <p className='text-muted-foreground text-sm'>
          {describeFunding(goal.funding)}
          {dateText}
        </p>
        {words.need && <p className='text-sm'>{words.need}</p>}
        <p className='text-muted-foreground text-sm'>
          {words.stateLabel && (
            <span className='text-foreground font-medium'>
              {words.stateLabel}.{' '}
            </span>
          )}
          {words.standing}
        </p>
        <div className='pt-1'>
          <PriorityBadge priority={goal.priority} />
        </div>
      </div>
    </li>
  );
}

export default GoalRow;
