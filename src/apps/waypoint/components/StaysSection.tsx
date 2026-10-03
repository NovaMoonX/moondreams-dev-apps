import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import StayCard from '@apps/waypoint/components/StayCard';
import SectionHeader from '@/components/SectionHeader';
import StayFormModal from '@apps/waypoint/components/StayFormModal';
import {
  createStay,
  deleteStay,
  updateStay,
  updateStayNotes,
} from '@apps/waypoint/store/actions/stayActions';
import { selectSortedStays, selectTimelineEvents } from '@apps/waypoint/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import type { Stay, TripSpace } from '@apps/waypoint/types';
import { canCreateItem, canEditExistingItem } from '@apps/waypoint/utils/roleGuards';
import { getPlaceBiasFromItems } from '@/lib/places/placesApi';

interface StaysSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

type StayValues = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

export function StaysSection({ trip, currentUserId }: StaysSectionProps) {
  const dispatch = useAppDispatch();
  const stays = useAppSelector(selectSortedStays);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The mobile details drawer's own close, threaded through from whichever StayCard opened
  // the edit form — invoked only once that edit actually succeeds, never on cancel.
  const editSuccessRef = useRef<(() => void) | undefined>(undefined);
  const canAddStays = canCreateItem(trip, currentUserId);
  const canEditExisting = canEditExistingItem(trip, currentUserId);
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const events = useAppSelector(selectTimelineEvents);
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);

  const handleSubmit = async (stay: StayValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingStay) {
        await dispatch(
          updateStay({ uid: currentUserId, trip, stayId: editingStay.id, stay, previousStay: editingStay }),
        ).unwrap();
      } else {
        await dispatch(createStay({ uid: currentUserId, trip, stay })).unwrap();
      }
      setIsModalOpen(false);
      setEditingStay(undefined);
      editSuccessRef.current?.();
      editSuccessRef.current = undefined;
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to add this stay.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (stay: Stay) => {
    const confirmed = await confirm({
      title: 'Delete stay',
      message: `Delete "${stay.name}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await dispatch(deleteStay({ uid: currentUserId, trip, stayId: stay.id })).unwrap();
      setIsModalOpen(false);
      setEditingStay(undefined);
      editSuccessRef.current?.();
      editSuccessRef.current = undefined;
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete stay',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <section className='space-y-4 pt-4'>
      <SectionHeader
        title='Stays'
        action={canAddStays && <Button onClick={() => setIsModalOpen(true)}>Add stay</Button>}
      />
      {stays.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No stays planned yet.</p>
      ) : (
        <div className='space-y-3'>
          {stays.map((stay) => (
            <StayCard
              key={stay.id}
              trip={trip}
              stay={stay}
              canEdit={canEditExisting}
              onEdit={(selectedStay, onSuccess) => {
                setEditingStay(selectedStay);
                setIsModalOpen(true);
                editSuccessRef.current = onSuccess;
              }}
              onSaveNotes={async (selectedStay, notes) => {
                await dispatch(
                  updateStayNotes({ uid: currentUserId, trip, stay: selectedStay, notes }),
                ).unwrap();
              }}
            />
          ))}
        </div>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <StayFormModal
        key={`${editingStay?.id ?? 'new'}-${isModalOpen ? 'open' : 'closed'}`}
        isOpen={isModalOpen}
        trip={trip}
        stay={editingStay}
        placeBias={placeBias}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingStay ? () => handleDelete(editingStay) : undefined}
        onClose={() => {
          setIsModalOpen(false);
          setEditingStay(undefined);
          // Canceling leaves the mobile drawer open, if it's the one that opened this modal.
          editSuccessRef.current = undefined;
        }}
      />
    </section>
  );
}

export default StaysSection;
