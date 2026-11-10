import { useSyncExternalStore } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Hourglass } from 'lucide-react';

import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  isUnreachable,
  subscribeSorting,
} from '@apps/helm/queries/nomosMutations';
import type { OpenCapture } from '@apps/helm/types';
import {
  getOpenQuestions,
  getWaitingReason,
  type HeldItem,
} from '@apps/helm/utils/heldCaptures';

interface HeldRowProps {
  item: HeldItem;
  onOpen: (item: HeldItem) => void;
  /** Messages that joined this turn, in order; the row shows all the words. */
  joined?: OpenCapture[];
}

const getLine = (
  { kind, capture }: HeldItem,
  isUnreachableHere: boolean,
): { reason: string; trailing: string | null } => {
  const time = formatTime(capture.createdAt);
  if (kind === 'couldNotRead') {
    return { reason: HELM_COPY.couldNotRead, trailing: time };
  }
  if (kind === 'question') {
    return {
      reason:
        getOpenQuestions(capture)[0]?.question.prompt ?? HELM_COPY.unreadable,
      trailing: time,
    };
  }
  if (kind === 'failed') {
    return { reason: HELM_COPY.couldNotSort, trailing: time };
  }
  if (kind === 'moreToSort') {
    return { reason: HELM_COPY.moreToSort, trailing: HELM_COPY.sortTheRest };
  }
  return {
    reason: getWaitingReason(capture, isUnreachableHere),
    trailing: null,
  };
};

/** One turn that needs the person (a verdigris dot) or only waits (an hourglass, no dot), opening its sheet. */
function HeldRow({ item, onOpen, joined = [] }: HeldRowProps) {
  const { capture } = item;
  const isUnreachableHere = useSyncExternalStore(subscribeSorting, () =>
    isUnreachable(capture.id),
  );
  const { reason, trailing } = getLine(item, isUnreachableHere);
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(item)}
    >
      <span className='flex size-4 shrink-0 items-center justify-center'>
        {item.kind === 'waiting' ? (
          <Hourglass
            className='text-muted-foreground size-4'
            aria-hidden='true'
          />
        ) : (
          <span
            className='size-2 rounded-full bg-[var(--helm-verdigris)]'
            aria-hidden='true'
          />
        )}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 text-[15px] leading-[21px] break-words'>
          {[capture, ...joined]
            .map((message) =>
              message.isUnreadable ? HELM_COPY.unreadable : message.text,
            )
            .join(' ')}
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          <span className='flex gap-1'>
            <span className='min-w-0 truncate'>{reason}</span>
            {trailing && (
              <span className='shrink-0 whitespace-nowrap tabular-nums'>
                {'· '}
                {trailing}
              </span>
            )}
          </span>
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
