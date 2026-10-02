import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Car, ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';

import { selectRentals } from '@apps/waypoint/store/selectors';

interface RentalsEntryProps {
  onOpen: () => void;
}

function RentalsEntry({ onOpen }: RentalsEntryProps) {
  const rentals = useAppSelector(selectRentals);
  const [firstRental] = rentals;

  const title = firstRental
    ? `${firstRental.name}${rentals.length > 1 ? ` + ${rentals.length - 1} more` : ''}`
    : 'Add your rentals';
  const summary = firstRental
    ? `${rentals.length} ${rentals.length === 1 ? 'rental' : 'rentals'}`
    : 'Keep the car rental handy — where to pick it up, when to bring it back.';

  return (
    <section className='space-y-1'>
      <h3 className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'>
        Rentals
      </h3>
      <Button
        type='button'
        variant='tertiary'
        onClick={onOpen}
        className='border-border h-auto w-full justify-start gap-3 rounded-xl border px-3 py-3 text-left'
      >
        <Car className='text-muted-foreground h-5 w-5 shrink-0' />
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-medium'>{title}</span>
          <span className='text-muted-foreground block text-xs'>{summary}</span>
        </span>
        <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
      </Button>
    </section>
  );
}

export default RentalsEntry;
