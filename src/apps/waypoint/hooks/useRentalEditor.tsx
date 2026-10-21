import { useRef, useState, type ReactNode } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import RentalFormModal from '@apps/waypoint/components/RentalFormModal';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import {
  createRental,
  deleteRental,
  updateRental,
  type RentalFormFields,
} from '@apps/waypoint/store/actions/rentalActions';
import { selectSortedStays, selectTimelineEvents } from '@apps/waypoint/store/selectors';
import type { Rental, TripSpace } from '@apps/waypoint/types';
import { getRentalSubject } from '@apps/waypoint/utils/relatedSubjects';

/** The rental form with its save and delete, for any screen that opens it (Rentals, Overview). */
export function useRentalEditor(trip: TripSpace, currentUserId: string) {
  const dispatch = useAppDispatch();
  const stays = useAppSelector(selectSortedStays);
  const events = useAppSelector(selectTimelineEvents);
  const [isOpen, setIsOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The mobile details drawer's own close, threaded through from whichever card opened the edit
  // form — invoked only once that edit actually succeeds, never on cancel.
  const editSuccessRef = useRef<(() => void) | undefined>(undefined);
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { startFollowUp } = useRelatedFlow();
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);

  const closeModal = () => {
    setIsOpen(false);
    setEditingRental(undefined);
    editSuccessRef.current?.();
    editSuccessRef.current = undefined;
  };

  const handleSubmit = async (rental: RentalFormFields) => {
    setIsSubmitting(true);
    try {
      if (editingRental) {
        await dispatch(updateRental({ uid: currentUserId, trip, rentalId: editingRental.id, rental })).unwrap();
      } else {
        const created = await dispatch(createRental({ uid: currentUserId, trip, rental })).unwrap();
        startFollowUp(getRentalSubject(created));
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

  const openEditor = (rental: Rental, onSuccess?: () => void) => {
    setEditingRental(rental);
    setIsOpen(true);
    editSuccessRef.current = onSuccess;
  };

  const openNew = () => setIsOpen(true);

  const editor: ReactNode = (
    <RentalFormModal
      key={`${editingRental?.id ?? 'new'}-${isOpen ? 'open' : 'closed'}`}
      isOpen={isOpen}
      trip={trip}
      rental={editingRental}
      placeBias={placeBias}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onDelete={editingRental ? () => handleDelete(editingRental) : undefined}
      onClose={() => {
        setIsOpen(false);
        setEditingRental(undefined);
        // Canceling leaves the mobile drawer open, if it's the one that opened this form.
        editSuccessRef.current = undefined;
      }}
    />
  );

  return { openEditor, openNew, editor };
}
