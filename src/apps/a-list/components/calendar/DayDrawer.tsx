import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromLocalDateAndTimeInputValues } from '@/utils/dateInputUtils';
import { formatDate } from '@/utils/formatUtils';
import { AddFlow } from '@apps/a-list/components/add/AddFlow';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import ViewingRow from '@apps/a-list/components/calendar/ViewingRow';
import { ViewingPanel } from '@apps/a-list/components/viewing/ViewingDrawer';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  selectOpeningsByDay,
  selectViewingsByDay,
} from '@apps/a-list/store/selectors';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

interface DayDrawerProps {
  dayKey: string;
  onClose: () => void;
}

/** One day's movies and the watchlist movies opening that day; picking one swaps the drawer in place, with a way back to the list. */
function DayDrawer({ dayKey, onClose }: DayDrawerProps) {
  const { openOverlay } = useAListOverlay();
  const now = useNow();
  const viewings = useAppSelector(selectViewingsByDay)[dayKey] ?? [];
  const openings =
    useAppSelector((state) => selectOpeningsByDay(state, now))[dayKey] ?? [];
  const [viewingId, setViewingId] = useState<string | null>(null);
  // Held, not looked up: saving the plan drops the movie from the day's openings while the form is still open.
  const [planRow, setPlanRow] = useState<WatchlistRowData | null>(null);
  const dayStart = fromLocalDateAndTimeInputValues(dayKey, '00:00') ?? now;

  if (viewingId !== null) {
    return (
      <Drawer isOpen onClose={onClose} title='Movie'>
        <ViewingPanel
          viewingId={viewingId}
          onClose={() => setViewingId(null)}
          onBack={() => setViewingId(null)}
          backLabel='Back to the day'
        />
      </Drawer>
    );
  }

  if (planRow !== null) {
    return (
      <Drawer isOpen onClose={onClose} title='Plan a movie'>
        <AddFlow
          overlay={{
            kind: 'add',
            destination: 'calendar',
            date: dayKey,
            mode: 'single',
          }}
          initialSelection={{
            kind: 'known',
            movieKey: planRow.item.movieKey,
            movie: planRow.item.movie,
            isManual: false,
          }}
          onBack={() => setPlanRow(null)}
          onClose={onClose}
        />
      </Drawer>
    );
  }

  return (
    <Drawer isOpen onClose={onClose} title={formatDate(dayStart)}>
      <div className='space-y-4'>
        {viewings.length === 0 && openings.length === 0 && (
          <p className='text-muted-foreground py-2 text-center text-sm'>
            🍿 Nothing on this day yet.
          </p>
        )}
        {viewings.length > 0 && (
          <ul className='divide-border divide-y'>
            {viewings.map((viewing) => (
              <li key={viewing.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  size='stripped'
                  aria-label={`Open ${viewing.movie.title}`}
                  className='text-foreground! hover:bg-muted/60 h-auto w-full justify-start rounded-2xl px-2 py-0 text-left font-normal'
                  onClick={() => setViewingId(viewing.id)}
                >
                  <ViewingRow viewing={viewing} now={now} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {openings.length > 0 && (
          <section className='bg-accent/60 dark:bg-muted space-y-3 rounded-2xl p-3'>
            <div className='space-y-0.5'>
              <p className='text-sm font-medium'>🎬 Opening this day</p>
              <p className='text-muted-foreground text-xs'>
                From your watchlist. Tap one to plan it.
              </p>
            </div>
            <ul className='-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1'>
              {openings.map((row) => (
                <li key={row.item.movieKey} className='w-14 shrink-0 snap-start'>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='stripped'
                    aria-label={`Plan ${row.item.movie.title} for this day`}
                    className='text-foreground! h-auto w-full flex-col items-stretch gap-1.5 rounded-xl p-0 text-left font-normal'
                    onClick={() => setPlanRow(row)}
                  >
                    <span className='block aspect-[2/3] w-full overflow-hidden rounded-lg shadow-sm'>
                      <PosterCover
                        title={row.item.movie.title}
                        posterUrl={row.item.movie.posterUrl}
                        compact
                      />
                    </span>
                    <span className='line-clamp-2 text-[11px] leading-tight font-medium'>
                      {row.item.movie.title}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Button
          type='button'
          rounded='full'
          className='w-full'
          onClick={() =>
            openOverlay({
              kind: 'add',
              destination: 'calendar',
              date: dayKey,
              mode: 'single',
            })
          }
        >
          + Add a movie
        </Button>
      </div>
    </Drawer>
  );
}

export default DayDrawer;
