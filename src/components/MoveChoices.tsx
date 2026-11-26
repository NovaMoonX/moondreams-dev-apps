import { Button } from '@moondreamsdev/dreamer-ui/components';
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
  /** Two small buttons side by side in place of the rows, where space is tight. */
  isCompact?: boolean;
  className?: string;
}

const COMPACT_CLASS =
  "relative gap-1.5 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

/** The tap alternative to dragging: Move up and Move down rows for an item's own editor. */
function MoveChoices({
  itemNoun,
  onMoveUp,
  onMoveDown,
  upSubtitle,
  downSubtitle,
  isCompact = false,
  className,
}: MoveChoicesProps) {
  if (!onMoveUp && !onMoveDown) return null;
  if (isCompact) {
    return (
      <div
        className={join('flex flex-wrap gap-2', className)}
        role='group'
        aria-label={`Move ${itemNoun}`}
      >
        {onMoveUp && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={COMPACT_CLASS}
            title={upSubtitle}
            onClick={onMoveUp}
          >
            <ArrowUp className='h-3.5 w-3.5' aria-hidden='true' />
            Move up
          </Button>
        )}
        {onMoveDown && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={COMPACT_CLASS}
            title={downSubtitle}
            onClick={onMoveDown}
          >
            <ArrowDown className='h-3.5 w-3.5' aria-hidden='true' />
            Move down
          </Button>
        )}
      </div>
    );
  }
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
