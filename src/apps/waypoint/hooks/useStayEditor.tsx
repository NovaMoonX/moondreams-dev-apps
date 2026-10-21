import { useRef, useState, type ReactNode } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import StayFormModal from '@apps/waypoint/components/StayFormModal';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import { createStay, deleteStay, updateStay } from '@apps/waypoint/store/actions/stayActions';
import { selectSortedStays, selectTimelineEvents } from '@apps/waypoint/store/selectors';
import type { Stay, TripSpace } from '@apps/waypoint/types';
import { getStaySubject } from '@apps/waypoint/utils/relatedSubjects';

type StayValues = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

/** The stay form with its save and delete, for any screen that opens it (Stays, Overview). */
export function useStayEditor(trip: TripSpace, currentUserId: string) {
  const dispatch = useAppDispatch();
  const stays = useAppSelector(selectSortedStays);
  const events = useAppSelector(selectTimelineEvents);
  const [isOpen, setIsOpen] = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The mobile details drawer's own close, threaded through from whichever card opened the edit
  // form — invoked only once that edit actually succeeds, never on cancel.
  const editSuccessRef = useRef<(() => void) | undefined>(undefined);
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { startFollowUp } = useRelatedFlow();
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);

  const close = () => {
    setIsOpen(false);
    setEditingStay(undefined);
  };

  const finish = () => {
    close();
    editSuccessRef.current?.();
    editSuccessRef.current = undefined;
  };

  const handleSubmit = async (stay: StayValues) => {
    setIsSubmitting(true);
    try {
      if (editingStay) {
        await dispatch(
          updateStay({ uid: currentUserId, trip, stayId: editingStay.id, stay, previousStay: editingStay }),
        ).unwrap();
      } else {
        const created = await dispatch(createStay({ uid: currentUserId, trip, stay })).unwrap();
        startFollowUp(getStaySubject(trip, created));
      }
      finish();
    } catch (submitError) {
      addToast({
        title: 'Unable to save this stay',
        description: getErrorMessage(submitError, 'Please try again.'),
        type: 'error',
      });
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
      finish();
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete stay',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const openEditor = (stay: Stay, onSuccess?: () => void) => {
    setEditingStay(stay);
    setIsOpen(true);
    editSuccessRef.current = onSuccess;
  };

  const openNew = () => setIsOpen(true);

  const editor: ReactNode = (
    <StayFormModal
      key={`${editingStay?.id ?? 'new'}-${isOpen ? 'open' : 'closed'}`}
      isOpen={isOpen}
      trip={trip}
      stay={editingStay}
      placeBias={placeBias}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onDelete={editingStay ? () => handleDelete(editingStay) : undefined}
      onClose={() => {
        close();
        // Canceling leaves the mobile drawer open, if it's the one that opened this form.
        editSuccessRef.current = undefined;
      }}
    />
  );

  return { openEditor, openNew, editor };
}
