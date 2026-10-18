import { memo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { formatDateShort } from '@/utils/formatUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  CONTAINER_FINISH_EMOJIS,
  CONTAINER_PLACE_EMOJIS,
} from '@apps/pinch/constants';
import type { Container } from '@apps/pinch/types';
import {
  getBatchServingsText,
  getEatByLabel,
  getEatByState,
  getFinishedKind,
  getFinishedText,
  getFrozenText,
  getLastPlaceEvent,
  isEatByShown,
} from '@apps/pinch/utils/containers';

interface ContainerRowProps {
  /** One box, or a batch put away together; a finished row is always one box. */
  boxes: Container[];
  title: string;
  /** Another row in the same place has this title, so the tags tell them apart. */
  isTwin: boolean;
  onOpen: (boxes: Container[]) => void;
  /** Pick-several mode: the row carries a tick and a tap ticks it instead of opening the box's sheet. */
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggle?: (boxes: Container[]) => void;
}

function ContainerRow({
  boxes,
  title,
  isTwin,
  onOpen,
  isSelecting = false,
  isSelected = false,
  onToggle,
}: ContainerRowProps) {
  const [container] = boxes;
  const isFinished = container.status === 'DONE';
  const isThawed = getLastPlaceEvent(container.history)?.kind === 'THAW';
  const state = getEatByState(container.eatBy);
  const isFrozen = container.place === 'FREEZER';
  const hasMadeTag = isTwin && !isFrozen;

  const body = (
    <>
      <span
        className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
        aria-hidden='true'
      >
        {isFinished
          ? CONTAINER_FINISH_EMOJIS[getFinishedKind(container)]
          : CONTAINER_PLACE_EMOJIS[container.place]}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block font-medium wrap-break-word'>
          {title}
        </span>
        <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal'>
          {isFinished ? (
            <span className='whitespace-nowrap'>
              {getFinishedText(container)} ·{' '}
              {formatDateShort(container.updatedAt)}
            </span>
          ) : (
            <>
              <span className='whitespace-nowrap'>
                {getBatchServingsText(boxes)}
              </span>
              {isFrozen && (
                <span className='whitespace-nowrap'>
                  {getFrozenText(container)}
                </span>
              )}
              {isEatByShown(container) &&
                (state === 'LATER' ? (
                  <span className='whitespace-nowrap'>
                    {getEatByLabel(container.eatBy)}
                  </span>
                ) : (
                  <EatByBadge
                    state={state}
                    label={getEatByLabel(container.eatBy)}
                  />
                ))}
              {(isThawed || hasMadeTag) && (
                <span className='whitespace-nowrap'>
                  {[
                    isThawed && 'Thawed',
                    hasMadeTag &&
                      `Made ${formatDateShort(container.createdAt)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </>
          )}
        </span>
      </span>
    </>
  );

  if (isSelecting && !isFinished) {
    return (
      <label className='flex min-h-14 w-full cursor-pointer items-start gap-3 py-2 select-none'>
        <span className='mt-0.5 inline-flex shrink-0'>
          <Checkbox
            aria-label={`${title}, ${getBatchServingsText(boxes)}`}
            checked={isSelected}
            onCheckedChange={() => onToggle?.(boxes)}
          />
        </span>
        {body}
      </label>
    );
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(boxes)}
      className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      {body}
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default memo(ContainerRow);
