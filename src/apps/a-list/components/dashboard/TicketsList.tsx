import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDate } from '@/utils/formatUtils';
import ViewingRow from '@apps/a-list/components/calendar/ViewingRow';
import Pill from '@apps/a-list/components/shared/Pill';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectSeenTicketGroups } from '@apps/a-list/store/selectors';

export type TicketsView = 'paid' | 'unpriced';

interface TicketsListProps {
  initialView: TicketsView;
  onBack: () => void;
}

/** Every movie that has been seen, sorted by whether its ticket price is on record yet. */
function TicketsList({ initialView, onBack }: TicketsListProps) {
  const { openOverlay } = useAListOverlay();
  const now = useNow();
  const { paid, unpriced } = useAppSelector(selectSeenTicketGroups);
  const [view, setView] = useState<TicketsView>(initialView);
  const viewings = view === 'paid' ? paid : unpriced;

  const getEmptyText = () => {
    if (view === 'paid')
      return "🎟️ No tickets on record yet. Mark a movie paid and it'll show up here.";
    return '🎉 Every movie you have seen has its ticket on record.';
  };

  return (
    <section className='space-y-4'>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label='Back to the dashboard'
          onClick={onBack}
        >
          <ChevronLeft className='h-5 w-5' />
        </Button>
        <h2 className='text-xl font-semibold'>Tickets</h2>
      </div>
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
                aria-label={`Open ${viewing.movie.title}, ${formatDate(viewing.showtimeAt)}`}
                className='text-foreground! hover:bg-muted/60 h-auto w-full justify-start rounded-2xl px-2 py-0 text-left font-normal'
                onClick={() => openOverlay({ kind: 'viewing', id: viewing.id })}
              >
                <ViewingRow viewing={viewing} now={now} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default TicketsList;
