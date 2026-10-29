import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromLocalDateAndTimeInputValues } from '@/utils/dateInputUtils';
import { formatDate } from '@/utils/formatUtils';
import SectionDivider from '@/components/SectionDivider';
import { AddFlow } from '@apps/a-list/components/add/AddFlow';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import PriorityBadge from '@apps/a-list/components/shared/PriorityBadge';
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
        {viewings.length === 0 ? (
          <p className='text-muted-foreground py-2 text-center text-sm'>
            {openings.length > 0
              ? '🍿 Nothing planned yet.'
              : '🍿 Nothing on this day yet.'}
          </p>
        ) : (
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
          <div className='space-y-1'>
            <SectionDivider label='🎬 Opening this day' />
            <ul className='divide-border divide-y'>
              {openings.map((row) => (
                <li key={row.item.movieKey}>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='stripped'
                    aria-label={`Plan ${row.item.movie.title} for this day`}
                    className='text-foreground! hover:bg-muted/60 h-auto w-full justify-start rounded-2xl px-2 py-0 text-left font-normal'
                    onClick={() => setPlanRow(row)}
                  >
                    <div className='flex w-full items-center gap-3 py-2.5'>
                      <span className='h-16 w-11 shrink-0 overflow-hidden rounded-lg shadow-sm'>
                        <PosterCover
                          title={row.item.movie.title}
                          posterUrl={row.item.movie.posterUrl}
                          compact
                        />
                      </span>
                      <div className='min-w-0 flex-1 space-y-1 text-left'>
                        <p className='truncate font-medium'>
                          {row.item.movie.title}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                          Plan it for this day
                        </p>
                        <PriorityBadge priority={row.item.priority} />
                      </div>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
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
