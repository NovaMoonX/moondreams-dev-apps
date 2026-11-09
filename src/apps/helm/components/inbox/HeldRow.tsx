import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Hourglass } from 'lucide-react';

import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { getWaitingReason, type HeldItem } from '@apps/helm/utils/heldCaptures';

interface HeldRowProps {
  item: HeldItem;
  onOpen: (item: HeldItem) => void;
}

const getLine = ({ kind, capture }: HeldItem) => {
  const time = formatTime(capture.createdAt);
  if (kind === 'couldNotRead') return `${HELM_COPY.couldNotRead} · ${time}`;
  if (kind === 'failed') return `${HELM_COPY.couldNotSort} · ${time}`;
  if (kind === 'moreToSort') {
    return `${HELM_COPY.moreToSort} · ${HELM_COPY.sortTheRest}`;
  }
  return `${getWaitingReason(capture)} · ${time}`;
};

/** One turn that needs the person (a verdigris dot) or only waits (an hourglass, no dot), opening its sheet. */
function HeldRow({ item, onOpen }: HeldRowProps) {
  const { capture } = item;
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(item)}
    >
      {item.kind === 'waiting' ? (
        <Hourglass
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      ) : (
        <span
          className='size-2 shrink-0 rounded-full bg-[var(--helm-verdigris)]'
          aria-hidden='true'
        />
      )}
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-1 text-[15px] leading-[21px] break-words'>
          {capture.isUnreadable ? HELM_COPY.unreadable : capture.text}
        </span>
        <span className='text-muted-foreground block text-[13px] text-pretty'>
          {getLine(item)}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default HeldRow;
