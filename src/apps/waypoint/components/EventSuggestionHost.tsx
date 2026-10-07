import { useImperativeHandle, useState, type Ref } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import EventSuggestionFormModal from '@apps/waypoint/components/EventSuggestionFormModal';
import { createEventSuggestion, updateEventSuggestion } from '@apps/waypoint/store/actions/eventSuggestionActions';
import type { EventSuggestion, TimelineEvent, TripSpace } from '@apps/waypoint/types';

export interface EventSuggestionHandle {
  open: (event: TimelineEvent, suggestion?: EventSuggestion) => void;
}

interface EventSuggestionHostProps {
  trip: TripSpace;
  currentUserId: string;
  handleRef: Ref<EventSuggestionHandle>;
}

type SuggestionFields = Omit<Parameters<typeof createEventSuggestion>[0], 'uid' | 'trip' | 'eventId'>;

// Owns the suggestion form so it can open from a details sheet that has already closed, or from a row on the page.
function EventSuggestionHost({ trip, currentUserId, handleRef }: EventSuggestionHostProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [target, setTarget] = useState<{ event: TimelineEvent; suggestion?: EventSuggestion } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useImperativeHandle(handleRef, () => ({ open: (event, suggestion) => setTarget({ event, suggestion }) }), []);

  const handleSubmit = async (fields: SuggestionFields) => {
    if (!target) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (target.suggestion) {
        await dispatch(
          updateEventSuggestion({ uid: currentUserId, trip, suggestion: target.suggestion, ...fields }),
        ).unwrap();
      } else {
        await dispatch(createEventSuggestion({ uid: currentUserId, trip, eventId: target.event.id, ...fields })).unwrap();
      }
      setTarget(null);
    } catch (suggestError) {
      addToast({
        title: 'Unable to send this suggestion',
        description: getErrorMessage(suggestError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return target ? (
    <EventSuggestionFormModal
      key={`${target.event.id}-${target.suggestion?.id ?? 'new'}`}
      isOpen
      trip={trip}
      event={target.event}
      suggestion={target.suggestion}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={() => setTarget(null)}
    />
  ) : null;
}

export default EventSuggestionHost;
