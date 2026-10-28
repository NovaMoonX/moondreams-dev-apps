import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { CHANGE_WORDS } from '@apps/runway/constants';
import { resolveNextChange } from '@apps/runway/engine/resolve';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';

interface ItemChangeControlsProps {
  itemId: string;
  /** What the row shows now. */
  current: ItemPayload;
  today: number;
  name: string;
  onChange: () => void;
}

/** The "Change" door on an item's row, and a line for a change that has been made but has not started. */
function ItemChangeControls({
  itemId,
  current,
  today,
  name,
  onChange,
}: ItemChangeControlsProps) {
  const next = useAppSelector((state) =>
    resolveNextChange(state.runway.versions, itemId, today),
  );
  const difference = next ? describeChange(current, next.payload) : '';
  const scheduled =
    next && difference !== ''
      ? `${CHANGE_WORDS.scheduled} ${formatDateUTC(next.effectiveFrom)}: ${difference}`
      : null;

  return (
    <div className='space-y-1'>
      {scheduled && (
        <p className='text-muted-foreground text-sm break-words'>{scheduled}</p>
      )}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className="text-foreground! relative h-7! min-h-0! w-fit px-3! py-0! before:absolute before:-inset-1.5 before:content-['']"
        aria-label={`${CHANGE_WORDS.change} ${name}`}
        onClick={onChange}
      >
        {CHANGE_WORDS.change}
      </Button>
    </div>
  );
}

export default ItemChangeControls;
