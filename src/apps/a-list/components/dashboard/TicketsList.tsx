import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDate } from '@/utils/formatUtils';
import ViewingRow from '@apps/a-list/components/calendar/ViewingRow';
import Pill from '@apps/a-list/components/shared/Pill';
import ViewingDrawer from '@apps/a-list/components/viewing/ViewingDrawer';
import { selectSeenTicketGroups } from '@apps/a-list/store/selectors';

export type TicketsView = 'paid' | 'unpriced';

interface TicketsListProps {
  initialView: TicketsView;
  onClose: () => void;
}

/** Every movie that has been seen, sorted by whether its ticket price is on record yet. */
function TicketsList({ initialView, onClose }: TicketsListProps) {
  const now = useNow();
  const { paid, unpriced } = useAppSelector(selectSeenTicketGroups);
  const [view, setView] = useState<TicketsView>(initialView);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewings = view === 'paid' ? paid : unpriced;

  const getEmptyText = () => {
    if (view === 'paid')
      return "🎟️ No tickets on record yet. Mark a movie paid and it'll show up here.";
    return '🎉 Every movie you have seen has its ticket on record.';
  };

  return (
    <Subview title='Tickets' onClose={onClose}>
      <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        <Pill
          emoji='🧾'
          isSelected={view === 'unpriced'}
          onClick={() => setView('unpriced')}
        >
          Needs a price ({unpriced.length})
        </Pill>
        <Pill
          emoji='💵'
          isSelected={view === 'paid'}
          onClick={() => setView('paid')}
        >
          Paid ({paid.length})
        </Pill>
      </div>
      {viewings.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{getEmptyText()}</p>
      ) : (
        <ul className='divide-border divide-y'>
          {viewings.map((viewing) => (
            <li key={viewing.id}>
              <Button
                type='button'
                variant='tertiary'
                size='stripped'
                aria-label={`Open ${viewing.movie.title}, ${formatDate(viewing.showtimeAt)}`}
                className='text-foreground! hover:bg-muted/60 h-auto w-full justify-start rounded-2xl px-2 py-0 text-left font-normal'
                onClick={() => setViewingId(viewing.id)}
              >
                <ViewingRow viewing={viewing} now={now} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      </div>
      {viewingId !== null && (
        <ViewingDrawer
          key={viewingId}
          viewingId={viewingId}
          onClose={() => setViewingId(null)}
        />
      )}
    </Subview>
  );
}

export default TicketsList;
