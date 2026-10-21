import { Button } from '@moondreamsdev/dreamer-ui/components';

import StayCard from '@apps/waypoint/components/StayCard';
import { useStayEditor } from '@apps/waypoint/hooks/useStayEditor';
import SectionHeader from '@/components/SectionHeader';
import { updateStayNotes } from '@apps/waypoint/store/actions/stayActions';
import { selectSortedStays } from '@apps/waypoint/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store';
import type { TripSpace } from '@apps/waypoint/types';
import { canCreateItem, canEditExistingItem } from '@apps/waypoint/utils/roleGuards';

interface StaysSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

export function StaysSection({ trip, currentUserId }: StaysSectionProps) {
  const dispatch = useAppDispatch();
  const stays = useAppSelector(selectSortedStays);
  const canAddStays = canCreateItem(trip, currentUserId);
  const canEditExisting = canEditExistingItem(trip, currentUserId);
  const { openEditor, openNew, editor } = useStayEditor(trip, currentUserId);

  return (
    <section className='space-y-4 pt-4'>
      <SectionHeader
        title='Stays'
        subtitle={`${stays.length} ${stays.length === 1 ? 'stay' : 'stays'}`}
        action={canAddStays && <Button onClick={openNew}>Add</Button>}
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
              onEdit={openEditor}
              onSaveNotes={async (selectedStay, notes) => {
                await dispatch(
                  updateStayNotes({ uid: currentUserId, trip, stay: selectedStay, notes }),
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

export default StaysSection;
