import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { X } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatCountdown } from '@/utils/formatUtils';
import { PREVIEWS_BUFFER_MINUTES } from '@apps/a-list/constants';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectPreviewsWindowViewing } from '@apps/a-list/store/selectors';

function getSubtitle(showtimeAt: number, now: number) {
  if (now < showtimeAt) {
    const countdown = formatCountdown(showtimeAt, now);
    const label =
      countdown === 'starting now' ? 'Starting now' : `Starts ${countdown}`;
    return `${label}. Trailers roll first, so save any you love.`;
  }

  if (now - showtimeAt <= PREVIEWS_BUFFER_MINUTES * 60_000) {
    return 'Trailers are rolling. Spot one you like?';
  }

  return 'Caught a trailer you liked? Save it before you forget.';
}

/** Sits above the Calendar icon, never as an overlay: while a showing's previews are near, a bubble offers a one-tap way to save the trailers' movies, and it folds into a chip that brings it back. */
function PreviewsNudge() {
  const now = useNow();
  const { openOverlay } = useAListOverlay();
  const viewing = useAppSelector((state) =>
    selectPreviewsWindowViewing(state, now),
  );
  // Folding it away lasts until the app is next opened.
  const [foldedIds, setFoldedIds] = useState<string[]>([]);

  if (!viewing) {
    return null;
  }

  const isFolded = foldedIds.includes(viewing.id);
  const anchor = 'absolute bottom-full left-1/2 z-10 -translate-x-1/2';

  if (isFolded) {
    return (
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label='Show add from trailers'
        className={join(anchor, 'mb-8 bg-popover! ring-primary/30 aspect-square size-10 min-w-0 shrink-0 p-0! text-lg shadow-lg ring-2')}
        onClick={() =>
          setFoldedIds((current) => current.filter((id) => id !== viewing.id))
        }
      >
        <span aria-hidden='true'>📽️</span>
      </Button>
    );
  }

  return (
    <div role='status' className={join(anchor, 'mb-10 w-72')}>
      <div className='border-primary/30 bg-popover rounded-2xl border p-3 shadow-lg'>
        <div className='flex items-start gap-2'>
          <span className='w-6 shrink-0 text-center text-xl' aria-hidden='true'>
            📽️
          </span>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium'>
              {viewing.movie.title}
            </p>
            <p className='text-muted-foreground text-xs text-pretty'>
              {getSubtitle(viewing.showtimeAt, now)}
            </p>
          </div>
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            rounded='full'
            aria-label='Fold this away'
            className="relative -mt-1 -mr-1 h-7 w-7 before:absolute before:-inset-2 before:content-['']"
            onClick={() => setFoldedIds((current) => [...current, viewing.id])}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
        <Button
          type='button'
          size='sm'
          rounded='full'
          className='mt-2 w-full'
          onClick={() =>
            openOverlay({ kind: 'add', destination: 'watchlist', mode: 'quick' })
          }
        >
          Add from trailers
        </Button>
      </div>
      <span
        aria-hidden='true'
        className='border-primary/30 bg-popover absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b'
      />
    </div>
  );
}

export default PreviewsNudge;
