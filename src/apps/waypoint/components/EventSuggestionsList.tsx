import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ThumbsUp } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { useUserInfo } from '@/hooks/useUserInfo';
import { formatDateTime } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import EventSuggestionFormModal from '@apps/waypoint/components/EventSuggestionFormModal';
import {
  approveEventSuggestion,
  createEventSuggestion,
  declineEventSuggestion,
  toggleSuggestionUpvote,
  updateEventSuggestion,
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
  onEdit,
}: {
  trip: TripSpace;
  event: TimelineEvent;
  suggestion: EventSuggestion;
  currentUserId: string;
  isAdmin: boolean;
  onEdit: (suggestion: EventSuggestion) => void;
}) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isUpvoted = suggestion.upvotedBy.includes(currentUserId);
  const isOwnSuggestion = suggestion.createdBy === currentUserId;
  const suggesterInfo = useUserInfo([suggestion.createdBy])?.map[suggestion.createdBy];
  const suggesterName = suggesterInfo?.displayName || suggesterInfo?.email || 'Someone';

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
          {' · '}Suggested by {suggesterName}
        </p>
        {suggestion.note && (
          <p className='text-muted-foreground/70 mt-1 text-xs italic'>{suggestion.note}</p>
        )}
      </div>
      <div className='flex shrink-0 items-center gap-1.5'>
        <Button
          type='button'
          size='sm'
          variant='tertiary'
          aria-label={isUpvoted ? 'Remove upvote' : 'Upvote'}
          onClick={() => void handleUpvote()}
        >
          <ThumbsUp className={join('h-3.5 w-3.5', isUpvoted && 'fill-current text-primary')} />{' '}
          {suggestion.upvotedBy.length}
        </Button>
        {isOwnSuggestion && (
          <Button type='button' size='sm' variant='tertiary' onClick={() => onEdit(suggestion)}>
            Edit
          </Button>
        )}
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
  const [editingSuggestion, setEditingSuggestion] = useState<EventSuggestion | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = isTripAdmin(trip, currentUserId);

  if (!isTripMember(trip, currentUserId) || event.isArchived) {
    return null;
  }

  const handleSuggest = async (fields: SuggestionFields) => {
    setIsSubmitting(true);
    try {
      if (editingSuggestion) {
        await dispatch(
          updateEventSuggestion({ uid: currentUserId, trip, suggestion: editingSuggestion, ...fields }),
        ).unwrap();
      } else {
        await dispatch(
          createEventSuggestion({ uid: currentUserId, trip, eventId: event.id, ...fields }),
        ).unwrap();
      }
      setIsFormOpen(false);
      setEditingSuggestion(undefined);
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
          onEdit={(selectedSuggestion) => {
            setEditingSuggestion(selectedSuggestion);
            setIsFormOpen(true);
          }}
        />
      ))}
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='h-auto p-0 text-xs'
        onClick={() => {
          setEditingSuggestion(undefined);
          setIsFormOpen(true);
        }}
      >
        + Suggest a replacement
      </Button>
      <EventSuggestionFormModal
        key={`${editingSuggestion?.id ?? 'new'}-${isFormOpen ? 'open' : 'closed'}`}
        isOpen={isFormOpen}
        trip={trip}
        event={event}
        suggestion={editingSuggestion}
        isSubmitting={isSubmitting}
        onSubmit={handleSuggest}
        onClose={() => {
          setIsFormOpen(false);
          setEditingSuggestion(undefined);
        }}
      />
    </div>
  );
}

export default EventSuggestionsList;
