import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import EventFormModal, {
  type EventFormValues,
  type EventPrefill,
} from '@apps/waypoint/components/EventFormModal';
import { TIME_BLOCK_START_TIMES } from '@apps/waypoint/constants';
import { convertIdeaToEvent } from '@apps/waypoint/store/actions/ideaActions';
import { selectSortedTimelineEvents, selectStays } from '@apps/waypoint/store/selectors';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { getIdeaTiming } from '@apps/waypoint/utils/ideaLabels';

interface IdeaToEventModalProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
  onClose: () => void;
}

function getPrefill(trip: TripSpace, idea: TripIdea): EventPrefill {
  const { ideaDetails } = idea;
  const timeBlock = ideaDetails?.suggestedTimeBlocks[0];
  const base = {
    title: idea.title,
    notes: idea.notes,
    linkUrl: idea.linkUrl,
    dayIndex: getIdeaTiming(trip, idea).days[0] ?? 0,
    time: (timeBlock && TIME_BLOCK_START_TIMES[timeBlock]) || '12:00',
  };
  if (ideaDetails && 'cuisines' in ideaDetails) {
    return { ...base, eventType: 'DINING', cuisines: ideaDetails.cuisines, settings: [] };
  }
  return {
    ...base,
    eventType: 'ACTIVITY',
    cuisines: [],
    settings: ideaDetails && 'settings' in ideaDetails ? ideaDetails.settings : [],
  };
}

function IdeaToEventModal({ trip, idea, currentUserId, onClose }: IdeaToEventModalProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const events = useAppSelector(selectSortedTimelineEvents);
  const stays = useAppSelector(selectStays);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: EventFormValues) => {
    setIsSubmitting(true);
    try {
      await dispatch(convertIdeaToEvent({ uid: currentUserId, trip, idea, event })).unwrap();
      addToast({ title: `${idea.title} is on the itinerary`, type: 'success' });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <EventFormModal
      isOpen
      trip={trip}
      memberOptions={memberOptions}
      prefill={getPrefill(trip, idea)}
      events={events}
      placeBias={getPlaceBiasFromItems([...stays, ...events])}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default IdeaToEventModal;
