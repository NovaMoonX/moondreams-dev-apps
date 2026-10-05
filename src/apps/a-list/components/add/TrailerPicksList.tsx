import { Button } from '@moondreamsdev/dreamer-ui/components';

import PosterCover from '@apps/a-list/components/shared/PosterCover';
import type { WatchlistItem } from '@apps/a-list/types';

interface TrailerPicksListProps {
  picks: WatchlistItem[];
  isBusy: boolean;
  onUndo: (item: WatchlistItem) => void;
}

/** What has been saved from trailers so far, newest first, each with a one-tap undo. */
function TrailerPicksList({ picks, isBusy, onUndo }: TrailerPicksListProps) {
  return (
    <section className='space-y-1'>
      <h3 className='text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase'>
        <span className='w-5 shrink-0 text-center text-sm' aria-hidden='true'>
          📽️
        </span>
        Added from trailers · {picks.length}
      </h3>
      <ul className='max-h-44 space-y-0.5 overflow-y-auto'>
        {picks.map((item) => (
          <li key={item.movieKey} className='flex items-center gap-3 py-1'>
            <span className='h-10 w-7 shrink-0 overflow-hidden rounded-md shadow-sm'>
              <PosterCover
                title={item.movie.title}
                posterUrl={item.movie.posterUrl}
                compact
              />
            </span>
            <span className='min-w-0 flex-1 truncate text-sm font-medium'>
              {item.movie.title}
            </span>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              rounded='full'
              disabled={isBusy}
              onClick={() => onUndo(item)}
            >
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TrailerPicksList;
