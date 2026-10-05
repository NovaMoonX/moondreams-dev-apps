import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import RentalCard from '@apps/waypoint/components/RentalCard';
import RentalFormModal from '@apps/waypoint/components/RentalFormModal';
import SectionHeader from '@/components/SectionHeader';
import {
  createRental,
  deleteRental,
  updateRental,
  updateRentalNotes,
  type RentalFormFields,
} from '@apps/waypoint/store/actions/rentalActions';
import {
  selectSortedRentals,
  selectSortedStays,
  selectTimelineEvents,
} from '@apps/waypoint/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import type { Rental, TripSpace } from '@apps/waypoint/types';
import { canCreateItem, canEditExistingItem } from '@apps/waypoint/utils/roleGuards';

interface RentalsSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

export function RentalsSection({ trip, currentUserId }: RentalsSectionProps) {
  const dispatch = useAppDispatch();
  const rentals = useAppSelector(selectSortedRentals);
  const stays = useAppSelector(selectSortedStays);
  const events = useAppSelector(selectTimelineEvents);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The mobile details drawer's own close, threaded through from whichever RentalCard opened
  // the edit form — invoked only once that edit actually succeeds, never on cancel.
  const editSuccessRef = useRef<(() => void) | undefined>(undefined);
  const canAddRentals = canCreateItem(trip, currentUserId);
  const canEditExisting = canEditExistingItem(trip, currentUserId);
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRental(undefined);
    editSuccessRef.current?.();
    editSuccessRef.current = undefined;
  };

  const handleSubmit = async (rental: RentalFormFields) => {
    setIsSubmitting(true);
    try {
      if (editingRental) {
        await dispatch(
          updateRental({ uid: currentUserId, trip, rentalId: editingRental.id, rental }),
        ).unwrap();
      } else {
        await dispatch(createRental({ uid: currentUserId, trip, rental })).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (rental: Rental) => {
    const confirmed = await confirm({
      title: 'Delete rental',
      message: `Delete "${rental.name}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await dispatch(deleteRental({ uid: currentUserId, trip, rentalId: rental.id })).unwrap();
      closeModal();
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete rental',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <section className='space-y-4 pt-4'>
      <SectionHeader
        title='Rentals'
        action={
          canAddRentals && (
            <div className='flex items-center gap-2'>
              <Button onClick={() => setIsModalOpen(true)}>Add</Button>
            </div>
          )
        }
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
              onEdit={(selectedRental, onSuccess) => {
                setEditingRental(selectedRental);
                setIsModalOpen(true);
                editSuccessRef.current = onSuccess;
              }}
              onSaveNotes={async (selectedRental, notes) => {
                await dispatch(
                  updateRentalNotes({ uid: currentUserId, trip, rental: selectedRental, notes }),
                ).unwrap();
              }}
            />
          ))}
        </div>
      )}
      <RentalFormModal
        key={`${editingRental?.id ?? 'new'}-${isModalOpen ? 'open' : 'closed'}`}
        isOpen={isModalOpen}
        trip={trip}
        rental={editingRental}
        placeBias={placeBias}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingRental ? () => handleDelete(editingRental) : undefined}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRental(undefined);
          // Canceling leaves the mobile drawer open, if it's the one that opened this modal.
          editSuccessRef.current = undefined;
        }}
      />
    </section>
  );
}

export default RentalsSection;
