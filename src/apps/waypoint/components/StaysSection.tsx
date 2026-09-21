import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import StayCard from '@apps/waypoint/components/StayCard';
import StayFormModal from '@apps/waypoint/components/StayFormModal';
import { createStay } from '@apps/waypoint/store/actions/stayActions';
import { selectStays } from '@apps/waypoint/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import type { Stay, TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

interface StaysSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

type StayValues = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

export function StaysSection({ trip, currentUserId }: StaysSectionProps) {
  const dispatch = useAppDispatch();
  const stays = useAppSelector(selectStays);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAddStays = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);

  const handleSubmit = async (stay: StayValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dispatch(createStay({ uid: currentUserId, trip, stay })).unwrap();
      setIsModalOpen(false);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to add this stay.'));
    } finally {
      setIsSubmitting(false);
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
          {stays.map((stay) => <StayCard key={stay.id} stay={stay} />)}
        </div>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <StayFormModal
        isOpen={isModalOpen}
        trip={trip}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}

export default StaysSection;
