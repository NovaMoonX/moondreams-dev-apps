import { Button } from '@moondreamsdev/dreamer-ui/components';

import RentalCard from '@apps/waypoint/components/RentalCard';
import { useRentalEditor } from '@apps/waypoint/hooks/useRentalEditor';
import SectionHeader from '@/components/SectionHeader';
import { updateRentalNotes } from '@apps/waypoint/store/actions/rentalActions';
import { selectSortedRentals } from '@apps/waypoint/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store';
import type { TripSpace } from '@apps/waypoint/types';
import { canCreateItem, canEditExistingItem } from '@apps/waypoint/utils/roleGuards';

interface RentalsSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

export function RentalsSection({ trip, currentUserId }: RentalsSectionProps) {
  const dispatch = useAppDispatch();
  const rentals = useAppSelector(selectSortedRentals);
  const canAddRentals = canCreateItem(trip, currentUserId);
  const canEditExisting = canEditExistingItem(trip, currentUserId);
  const { openEditor, openNew, editor } = useRentalEditor(trip, currentUserId);

  return (
    <section className='space-y-4 pt-4'>
      <SectionHeader
        title='Rentals'
        subtitle={`${rentals.length} ${rentals.length === 1 ? 'rental' : 'rentals'}`}
        action={canAddRentals && <Button onClick={openNew}>Add</Button>}
      />
      {rentals.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No rentals yet — add the car so everyone knows where and when to pick it up.
        </p>
      ) : (
        <div className='space-y-3'>
          {rentals.map((rental) => (
            <RentalCard
              key={rental.id}
              trip={trip}
              rental={rental}
              canEdit={canEditExisting}
              onEdit={openEditor}
              onSaveNotes={async (selectedRental, notes) => {
                await dispatch(
                  updateRentalNotes({ uid: currentUserId, trip, rental: selectedRental, notes }),
                ).unwrap();
              }}
            />
          ))}
        </div>
      )}
      {editor}
    </section>
  );
}

export default RentalsSection;
