import { Car } from 'lucide-react';

import { useAppSelector } from '@/store';

import SectionEntryRow from '@apps/waypoint/components/SectionEntryRow';
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
    <SectionEntryRow
      heading='Rentals'
      icon={<Car className='h-5 w-5' />}
      title={title}
      summary={summary}
      onOpen={onOpen}
    />
  );
}

export default RentalsEntry;
