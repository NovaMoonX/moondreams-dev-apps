import { useState } from 'react';

import { Modal } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery } from '@tanstack/react-query';

import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import type { PlaceSelectionResult } from '@/lib/places/types';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getEventSubject } from '@apps/waypoint/utils/relatedSubjects';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import EventFormModal, {
  type EventFormValues,
  type EventPrefill,
} from '@apps/waypoint/components/EventFormModal';
import { TIME_BLOCK_START_TIMES } from '@apps/waypoint/constants';
import { convertIdeaToEvent } from '@apps/waypoint/store/actions/ideaActions';
import { selectSortedTimelineEvents, selectStays } from '@apps/waypoint/store/selectors';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { ideaPlaceQueryOptions } from '@apps/waypoint/queries/ideaPlaceQueries';
import { getIdeaTiming } from '@apps/waypoint/utils/ideaLabels';

interface IdeaToEventModalProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
  onClose: () => void;
}

function getPrefill(trip: TripSpace, idea: TripIdea, place: PlaceSelectionResult | null): EventPrefill {
  const { ideaDetails } = idea;
  const timeBlock = ideaDetails?.suggestedTimeBlocks[0];
  const base = {
    title: place ? '' : idea.title,
    ...(place ? { place } : {}),
    notes: idea.notes,
    linkUrl: idea.linkUrl,
    dayIndex: getIdeaTiming(trip, idea).days[0] ?? 0,
    time: (timeBlock && TIME_BLOCK_START_TIMES[timeBlock]) || '12:00',
  };
  const cuisines = ideaDetails && 'cuisines' in ideaDetails ? ideaDetails.cuisines : [];
  const settings = ideaDetails && 'settings' in ideaDetails ? ideaDetails.settings : [];
  return idea.ideaType === 'RESTAURANT'
    ? { ...base, eventType: 'DINING', cuisines, settings: [] }
    : { ...base, eventType: 'ACTIVITY', cuisines: [], settings };
}

function IdeaToEventModal({ trip, idea, currentUserId, onClose }: IdeaToEventModalProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { startFollowUp } = useRelatedFlow();
  const events = useAppSelector(selectSortedTimelineEvents);
  const stays = useAppSelector(selectStays);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placeBias] = useState(() => getPlaceBiasFromItems([...stays, ...events]));
  const placeLookup = useQuery(ideaPlaceQueryOptions(idea.title, placeBias));

  const handleSubmit = async (event: EventFormValues) => {
    setIsSubmitting(true);
    try {
      const created = await dispatch(convertIdeaToEvent({ uid: currentUserId, trip, idea, event })).unwrap();
      addToast({ title: `${idea.title} is on the itinerary`, type: 'success' });
      startFollowUp(getEventSubject(trip, created));
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (placeLookup.isPending) {
    return (
      <Modal isOpen onClose={onClose} title='Itinerary'>
        <p className='text-muted-foreground text-sm'>Finding {idea.title}…</p>
      </Modal>
    );
  }

  return (
    <EventFormModal
      isOpen
      trip={trip}
      currentUserId={currentUserId}
      memberOptions={memberOptions}
      prefill={getPrefill(trip, idea, placeLookup.data ?? null)}
      events={events}
      placeBias={placeBias}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default IdeaToEventModal;
