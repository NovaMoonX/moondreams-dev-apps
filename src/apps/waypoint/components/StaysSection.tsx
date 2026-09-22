import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import StayCard from '@apps/waypoint/components/StayCard';
import StayFormModal from '@apps/waypoint/components/StayFormModal';
import { createStay, deleteStay, updateStay } from '@apps/waypoint/store/actions/stayActions';
import { selectStays } from '@apps/waypoint/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import type { Stay, TripSpace } from '@apps/waypoint/types';
import { canEditExistingItem, hasTripRole } from '@apps/waypoint/utils/roleGuards';

interface StaysSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

type StayValues = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

export function StaysSection({ trip, currentUserId }: StaysSectionProps) {
  const dispatch = useAppDispatch();
  const stays = useAppSelector(selectStays);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAddStays = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const canEditExisting = canEditExistingItem(trip, currentUserId);
  const { confirm } = useActionModal();
  const { addToast } = useToast();

  const handleSubmit = async (stay: StayValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingStay) {
        await dispatch(
          updateStay({ uid: currentUserId, trip, stayId: editingStay.id, stay }),
        ).unwrap();
      } else {
        await dispatch(createStay({ uid: currentUserId, trip, stay })).unwrap();
      }
      setIsModalOpen(false);
      setEditingStay(undefined);
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
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-xl font-semibold'>Stays</h2>
        {canAddStays && <Button onClick={() => setIsModalOpen(true)}>Add stay</Button>}
      </div>
      {stays.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No stays planned yet.</p>
      ) : (
        <div className='space-y-3'>
          {stays.map((stay) => (
            <StayCard
              key={stay.id}
              stay={stay}
              canEdit={canEditExisting}
              onEdit={(selectedStay) => {
                setEditingStay(selectedStay);
                setIsModalOpen(true);
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
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingStay ? () => handleDelete(editingStay) : undefined}
        onClose={() => {
          setIsModalOpen(false);
          setEditingStay(undefined);
        }}
      />
    </section>
  );
}

export default StaysSection;
