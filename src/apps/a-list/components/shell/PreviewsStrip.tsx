import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatCountdown, formatDuration } from '@/utils/formatUtils';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectPreviewsWindowViewing } from '@apps/a-list/store/selectors';
import type { AListTab } from '@apps/a-list/types';

interface PreviewsStripProps {
  activeTab: AListTab;
}

function getTimingLabel(showtimeAt: number, now: number) {
  if (now < showtimeAt) {
    const countdown = formatCountdown(showtimeAt, now);
    return countdown === 'starting now' ? countdown : `starts ${countdown}`;
  }

  const elapsed = now - showtimeAt;
  return elapsed < 60_000 ? 'starting now' : `started ${formatDuration(elapsed)} ago`;
}

/** A quiet row, never an overlay: while a showing's previews are near, it offers a one-tap way to save the trailers' movies. */
function PreviewsStrip({ activeTab }: PreviewsStripProps) {
  const now = useNow();
  const { openOverlay } = useAListOverlay();
  const viewing = useAppSelector((state) =>
    selectPreviewsWindowViewing(state, now),
  );
  // Hiding lasts until the app is next opened.
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  if (activeTab === 'dashboard' || !viewing || hiddenIds.includes(viewing.id)) {
    return null;
  }

  return (
    <div
      role='status'
      className='border-primary/30 bg-primary/5 flex items-start gap-3 rounded-2xl border px-4 py-3'
    >
      <span className='w-6 shrink-0 text-center text-xl' aria-hidden='true'>
        📽️
      </span>
      <div className='min-w-0 flex-1 space-y-2'>
        <div>
          <p className='truncate text-sm font-medium'>
            {viewing.movie.title} · {getTimingLabel(viewing.showtimeAt, now)}
          </p>
          <p className='text-muted-foreground text-xs'>
            Spot a trailer you like? Save it for later.
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          rounded='full'
          onClick={() =>
            openOverlay({ kind: 'add', destination: 'watchlist', mode: 'quick' })
          }
        >
          Add from trailers
        </Button>
      </div>
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        rounded='full'
        aria-label='Hide this reminder'
        onClick={() => setHiddenIds((current) => [...current, viewing.id])}
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}

export default PreviewsStrip;
