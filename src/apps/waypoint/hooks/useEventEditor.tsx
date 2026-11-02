import { useRef, useState, type ReactNode } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { useUserInfo } from '@/hooks/useUserInfo';
import { store, useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import EventFormModal, {
  type DeleteLinked,
  type EventFormValues,
  type EventPrefill,
  type NextLegSeed,
  type SubmitOptions,
} from '@apps/waypoint/components/EventFormModal';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import { useSyncBookings } from '@apps/waypoint/hooks/useSyncBookings';
import { deleteChecklistItem } from '@apps/waypoint/store/actions/checklistActions';
import { createEvent, deleteEvent, updateEvent } from '@apps/waypoint/store/actions/eventActions';
import { deleteExpense } from '@apps/waypoint/store/actions/expenseActions';
import { selectStays } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventSubject, isWorthFollowUp } from '@apps/waypoint/utils/relatedSubjects';

function describeRemoved({ checklistItemIds, expenseIds }: DeleteLinked) {
  const parts = [
    checklistItemIds.length > 0 ? `${checklistItemIds.length} ${checklistItemIds.length === 1 ? 'to-do' : 'to-dos'}` : null,
    expenseIds.length > 0 ? `${expenseIds.length} ${expenseIds.length === 1 ? 'expense' : 'expenses'}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? ` and its ${parts.join(' and ')}` : '';
}

/** The event form with its save and delete, for any screen that opens it (Timeline, Overview). */
export function useEventEditor(trip: TripSpace, currentUserId: string, events: TimelineEvent[]) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { startFollowUp } = useRelatedFlow();
  const syncBookings = useSyncBookings(trip.id);
  const stays = useAppSelector(selectStays);
  const [isOpen, setIsOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [legSeed, setLegSeed] = useState<NextLegSeed | undefined>();
  const [legCount, setLegCount] = useState(0);
  const [newDayIndex, setNewDayIndex] = useState<number | undefined>();
  const [newPrefill, setNewPrefill] = useState<EventPrefill | undefined>();
  // The mobile details drawer's own close, threaded through from whichever card opened the edit
  // form — invoked only once that edit actually succeeds, never on cancel.
  const editSuccessRef = useRef<(() => void) | undefined>(undefined);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);

  const resolveEditSuccess = () => {
    editSuccessRef.current?.();
    editSuccessRef.current = undefined;
  };

  const handleSubmit = async (event: EventFormValues, options?: SubmitOptions) => {
    setIsSubmitting(true);
    try {
      if (editingEvent) {
        await dispatch(
          updateEvent({
            uid: currentUserId,
            trip,
            eventId: editingEvent.id,
            event: { ...editingEvent, ...event },
            previousEvent: editingEvent,
          }),
        ).unwrap();
        await syncBookings(editingEvent.id, options?.bookings);
      } else {
        const created = await dispatch(createEvent({ uid: currentUserId, trip, event })).unwrap();
        const hasBookings = await syncBookings(created.id, options?.bookings);
        if (!options?.addLeg && isWorthFollowUp(created)) {
          startFollowUp(getEventSubject(trip, created), { hasBookings });
        }
      }
      setEditingEvent(undefined);
      if (options?.addLeg) {
        setLegSeed({ previous: event, arrivalPlace: options.arrivalPlace ?? null });
        setLegCount((count) => count + 1);
      } else {
        setLegSeed(undefined);
        setIsOpen(false);
      }
      resolveEditSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Deletes what the person ticked in the confirm, after the event itself; returns what could not be deleted. */
  const deleteLinked = async ({ checklistItemIds, expenseIds }: DeleteLinked) => {
    const { expenses } = store.getState().waypoint;
    const results = await Promise.allSettled([
      ...checklistItemIds.map((itemId) =>
        dispatch(deleteChecklistItem({ trip, uid: currentUserId, itemId, isPrivate: false })).unwrap(),
      ),
      ...expenseIds.flatMap((expenseId) => {
        const expense = expenses.items.find((candidate) => candidate.id === expenseId && candidate.tripId === trip.id);
        return expense ? [dispatch(deleteExpense(expense)).unwrap()] : [];
      }),
    ]);
    return results.filter((result) => result.status === 'rejected').length;
  };

  const handleDelete = async (event: TimelineEvent, linked: DeleteLinked) => {
    setIsSubmitting(true);
    try {
      await dispatch(deleteEvent({ uid: currentUserId, trip, eventId: event.id })).unwrap();
      setIsOpen(false);
      setEditingEvent(undefined);
      resolveEditSuccess();
      const removedCount = linked.checklistItemIds.length + linked.expenseIds.length;
      if (removedCount > 0) {
        const failedCount = await deleteLinked(linked);
        addToast(
          failedCount > 0
            ? {
                title: `Deleted ${event.title}`,
                description: `${failedCount === 1 ? '1 linked item' : `${failedCount} linked items`} could not be deleted. You can remove ${failedCount === 1 ? 'it' : 'them'} from the checklist or Expenses.`,
                type: 'error',
              }
            : {
                title: `Deleted ${event.title}${describeRemoved(linked)}`,
                type: 'success',
              },
        );
      }
    } catch (error) {
      addToast({
        title: 'Unable to delete event',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditor = (event: TimelineEvent, onSuccess?: () => void) => {
    setEditingEvent(event);
    setIsOpen(true);
    editSuccessRef.current = onSuccess;
  };

  const openNew = (dayIndex?: number, prefill?: EventPrefill) => {
    setEditingEvent(undefined);
    setNewDayIndex(dayIndex);
    setNewPrefill(prefill);
    setIsOpen(true);
  };

  const editor: ReactNode = (
    <EventFormModal
      key={`${editingEvent?.id ?? 'new'}-${isOpen ? 'open' : 'closed'}-${legCount}`}
      isOpen={isOpen}
      legFrom={legSeed}
      trip={trip}
      currentUserId={currentUserId}
      memberOptions={memberOptions}
      event={editingEvent}
      events={events}
      initialDayIndex={newDayIndex}
      prefill={newPrefill}
      placeBias={placeBias}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onDelete={editingEvent ? (linked) => handleDelete(editingEvent, linked) : undefined}
      onClose={() => {
        setIsOpen(false);
        setEditingEvent(undefined);
        setLegSeed(undefined);
        // Canceling leaves the mobile drawer open, if it's the one that opened this form.
        editSuccessRef.current = undefined;
      }}
    />
  );

  return { openEditor, openNew, editor, memberOptions };
}
