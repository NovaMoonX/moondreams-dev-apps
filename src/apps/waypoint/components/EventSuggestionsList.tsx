import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ThumbsUp } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import EventSuggestionFormModal from '@apps/waypoint/components/EventSuggestionFormModal';
import {
  approveEventSuggestion,
  createEventSuggestion,
  declineEventSuggestion,
  toggleSuggestionUpvote,
} from '@apps/waypoint/store/actions/eventSuggestionActions';
import { selectEventSuggestionsForEvent } from '@apps/waypoint/store/selectors';
import type { EventSuggestion, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin, isTripMember } from '@apps/waypoint/utils/roleGuards';

interface EventSuggestionsListProps {
  trip: TripSpace;
  event: TimelineEvent;
  currentUserId: string;
}

function SuggestionRow({
  trip,
  event,
  suggestion,
  currentUserId,
  isAdmin,
}: {
  trip: TripSpace;
  event: TimelineEvent;
  suggestion: EventSuggestion;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isUpvoted = suggestion.upvotedBy.includes(currentUserId);

  const handleUpvote = async () => {
    await dispatch(
      toggleSuggestionUpvote({ uid: currentUserId, trip, suggestionId: suggestion.id, isUpvoted }),
    ).unwrap();
  };

  const handleApprove = async () => {
    const confirmed = await confirm({
      title: 'Replace event',
      message: `Replace "${event.title}" with "${suggestion.suggestedTitle}"? The current event will be archived.`,
    });
    if (!confirmed) {
      return;
    }
    setIsSubmitting(true);
    try {
      await dispatch(
        approveEventSuggestion({ uid: currentUserId, trip, sourceEvent: event, suggestion }),
      ).unwrap();
    } catch (approveError) {
      addToast({
        title: 'Unable to approve this suggestion',
        description: getErrorMessage(approveError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    const confirmed = await confirm({
      title: 'Decline suggestion',
      message: `Decline the suggestion to replace this event with "${suggestion.suggestedTitle}"?`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setIsSubmitting(true);
    try {
      await dispatch(
        declineEventSuggestion({ uid: currentUserId, trip, suggestionId: suggestion.id }),
      ).unwrap();
    } catch (declineError) {
      addToast({
        title: 'Unable to decline this suggestion',
        description: getErrorMessage(declineError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='border-border bg-background flex flex-wrap items-center justify-between gap-2 rounded-md border p-2'>
      <div className='min-w-0'>
        <p className='text-sm font-medium'>{suggestion.suggestedTitle}</p>
        <p className='text-muted-foreground text-xs'>
          {formatDateTime(suggestion.suggestedStartAt)}
          {suggestion.suggestedLocationName ? ` · ${suggestion.suggestedLocationName}` : ''}
        </p>
        {suggestion.note && <p className='text-muted-foreground mt-1 text-xs'>{suggestion.note}</p>}
      </div>
      <div className='flex shrink-0 items-center gap-1.5'>
        <Button
          type='button'
          size='sm'
          variant={isUpvoted ? 'secondary' : 'tertiary'}
          aria-label={isUpvoted ? 'Remove upvote' : 'Upvote'}
          onClick={() => void handleUpvote()}
        >
          <ThumbsUp className='h-3.5 w-3.5' /> {suggestion.upvotedBy.length}
        </Button>
        {isAdmin && (
          <>
            <Button type='button' size='sm' variant='secondary' loading={isSubmitting} onClick={() => void handleDecline()}>
              Decline
            </Button>
            <Button type='button' size='sm' loading={isSubmitting} onClick={() => void handleApprove()}>
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

type SuggestionFields = Omit<
  Parameters<typeof createEventSuggestion>[0],
  'uid' | 'trip' | 'eventId'
>;

function EventSuggestionsList({ trip, event, currentUserId }: EventSuggestionsListProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const suggestions = useAppSelector(selectEventSuggestionsForEvent(event.id), shallowEqual);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = isTripAdmin(trip, currentUserId);

  if (!isTripMember(trip, currentUserId) || event.isArchived) {
    return null;
  }

  const handleSuggest = async (fields: SuggestionFields) => {
    setIsSubmitting(true);
    try {
      await dispatch(
        createEventSuggestion({ uid: currentUserId, trip, eventId: event.id, ...fields }),
      ).unwrap();
      setIsFormOpen(false);
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

  return (
    <div className='ml-4 space-y-2 border-l-2 border-dashed pl-4'>
      {suggestions.map((suggestion) => (
        <SuggestionRow
          key={suggestion.id}
          trip={trip}
          event={event}
          suggestion={suggestion}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      ))}
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='h-auto p-0 text-xs'
        onClick={() => setIsFormOpen(true)}
      >
        + Suggest a replacement
      </Button>
      <EventSuggestionFormModal
        key={isFormOpen ? 'open' : 'closed'}
        isOpen={isFormOpen}
        trip={trip}
        event={event}
        isSubmitting={isSubmitting}
        onSubmit={handleSuggest}
        onClose={() => setIsFormOpen(false)}
      />
    </div>
  );
}

export default EventSuggestionsList;
