import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromLocalDateAndTimeInputValues } from '@/utils/dateInputUtils';
import { formatDate } from '@/utils/formatUtils';
import ViewingRow from '@apps/a-list/components/calendar/ViewingRow';
import { ViewingPanel } from '@apps/a-list/components/viewing/ViewingDrawer';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectViewingsByDay } from '@apps/a-list/store/selectors';

interface DayDrawerProps {
  dayKey: string;
  onClose: () => void;
}

/** One day's movies; picking one swaps the drawer to that movie's details, with a way back to the list. */
function DayDrawer({ dayKey, onClose }: DayDrawerProps) {
  const { openOverlay } = useAListOverlay();
  const now = useNow();
  const viewings = useAppSelector(selectViewingsByDay)[dayKey] ?? [];
  const [viewingId, setViewingId] = useState<string | null>(null);
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

  return (
    <Drawer isOpen onClose={onClose} title={formatDate(dayStart)}>
      <div className='space-y-4'>
        {viewings.length === 0 ? (
          <p className='text-muted-foreground py-2 text-center text-sm'>
            🍿 Nothing on this day yet.
          </p>
        ) : (
          <ul className='divide-border divide-y'>
            {viewings.map((viewing) => (
              <li key={viewing.id}>
                <Button
                  type='button'
                  variant='tertiary'
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
