import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { DAY_MS } from '@apps/runway/engine/dates';
import { formatDateUTC } from '@/utils/formatUtils';
import ItemActionsSheet from '@apps/runway/components/ItemActionsSheet';
import { CHANGE_WORDS, LIFECYCLE_WORDS } from '@apps/runway/constants';
import { resolveNextChange, resolveVersion } from '@apps/runway/engine/resolve';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import type { ItemKind } from '@apps/runway/types';

interface ItemChangeControlsProps {
  itemId: string;
  kind: ItemKind;
  /** What the row shows now. */
  current: ItemPayload;
  today: number;
  name: string;
  onChange: () => void;
}

const buttonClass =
  "text-foreground! relative h-7! min-h-0! w-fit px-3! py-0! before:absolute before:-inset-1.5 before:content-['']";

/** The "Change" and "More" doors on an item's row, and a line for each thing that is made but not finished: a change that has not started, a stretch that goes back, an ending ahead. */
function ItemChangeControls({
  itemId,
  kind,
  current,
  today,
  name,
  onChange,
}: ItemChangeControlsProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const next = useAppSelector((state) =>
    resolveNextChange(state.runway.versions, itemId, today),
  );
  const stretchEnd = useAppSelector(
    (state) =>
      resolveVersion(state.runway.versions, itemId, today)?.effectiveUntil ??
      null,
  );
  const endedAt = useAppSelector(
    (state) => state.runway.items.find((item) => item.id === itemId)?.endedAt,
  );
  const difference = next ? describeChange(current, next.payload) : '';
  const lines = [
    ...(next &&
    difference !== '' &&
    (endedAt === null || endedAt === undefined || next.effectiveFrom <= endedAt)
      ? [
          `${CHANGE_WORDS.scheduled} ${formatDateUTC(next.effectiveFrom)}: ${difference}`,
        ]
      : []),
    ...(stretchEnd !== null
      ? [
          `${LIFECYCLE_WORDS.until} ${formatDateUTC(stretchEnd - DAY_MS)}, ${LIFECYCLE_WORDS.backAfter}.`,
        ]
      : []),
    ...(endedAt !== null && endedAt !== undefined
      ? [`${LIFECYCLE_WORDS.endsAfter} ${formatDateUTC(endedAt)}.`]
      : []),
  ];

  return (
    <div className='space-y-1'>
      {lines.map((line) => (
        <p key={line} className='text-muted-foreground text-sm break-words'>
          {line}
        </p>
      ))}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className={buttonClass}
          aria-label={`${CHANGE_WORDS.change} ${name}`}
          onClick={onChange}
        >
          {CHANGE_WORDS.change}
        </Button>
        {kind !== 'source' && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className={buttonClass}
            aria-label={`${LIFECYCLE_WORDS.moreAria} ${name}`}
            onClick={() => setIsMoreOpen(true)}
          >
            {LIFECYCLE_WORDS.more}
          </Button>
        )}
      </div>
      {isMoreOpen && (
        <ItemActionsSheet
          itemId={itemId}
          kind={kind}
          payload={current}
          today={today}
          onClose={() => setIsMoreOpen(false)}
        />
      )}
    </div>
  );
}

export default ItemChangeControls;
