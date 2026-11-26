import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowDown, ArrowUp } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

interface MoveChoicesProps {
  /** What is being moved, for the buttons' accessible names ("step"). */
  itemNoun: string;
  /** Leave out where there is no row above (the first one). */
  onMoveUp?: () => void;
  /** Leave out where there is no row below (the last one). */
  onMoveDown?: () => void;
  /** Where it lands, such as "Before step 3". */
  upSubtitle?: string;
  downSubtitle?: string;
  className?: string;
}

/** The tap alternative to dragging: Move up and Move down rows for an item's or group's own editor. */
function MoveChoices({
  itemNoun,
  onMoveUp,
  onMoveDown,
  upSubtitle,
  downSubtitle,
  className,
}: MoveChoicesProps) {
  if (!onMoveUp && !onMoveDown) return null;
  return (
    <div
      className={join('flex flex-col gap-2', className)}
      role='group'
      aria-label={`Move ${itemNoun}`}
    >
      {onMoveUp && (
        <ActionRow
          icon={<ArrowUp />}
          label='Move up'
          subtitle={upSubtitle}
          onClick={onMoveUp}
        />
      )}
      {onMoveDown && (
        <ActionRow
          icon={<ArrowDown />}
          label='Move down'
          subtitle={downSubtitle}
          onClick={onMoveDown}
        />
      )}
    </div>
  );
}

export default MoveChoices;
