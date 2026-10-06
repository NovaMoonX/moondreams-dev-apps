import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { airlinesQueryOptions } from '@/lib/airlines/airlinesQueries';
import { airportsQueryOptions } from '@/lib/airports/airportsQueries';
import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useNow } from '@/hooks/useNow';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayCount, getLocalDayIndex } from '@/utils/dateRangeUtils';
import EventFormModal, {
  type EventFormValues,
  type EventPrefill,
  type NextLegSeed,
  type SubmitOptions,
} from '@apps/waypoint/components/EventFormModal';
import { createEvent } from '@apps/waypoint/store/actions/eventActions';
import {
  getTripStatus,
  selectSortedTimelineEvents,
  selectStays,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import { isEventForMember } from '@apps/waypoint/utils/attendeeCalculators';
import { canCreateItem } from '@apps/waypoint/utils/roleGuards';
import { getEventTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';

interface TravelPromptsProps {
  trip: TripSpace;
  currentUserId: string;
}

type Leg = 'arrival' | 'departure';

function getPrefill(trip: TripSpace, leg: Leg, uid: string): EventPrefill {
  const lastDay = getDayCount(trip.startDate, trip.endDate) - 1;
  return {
    eventType: 'TRAVEL',
    title: '',
    notes: null,
    linkUrl: null,
    cuisines: [],
    settings: [],
    dayIndex: leg === 'arrival' ? 0 : lastDay,
    time: leg === 'arrival' ? '10:00' : '15:00',
    attendeeUids: [uid],
    transitType: 'FLIGHT',
  };
}

/** Asks each member for their own way in and way home, so Overview can show them their own travel
 * instead of everyone's. Skippable; once skipped it shrinks to a single quiet line. */
function TravelPrompts({ trip, currentUserId }: TravelPromptsProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const events = useAppSelector(selectSortedTimelineEvents);
  const stays = useAppSelector(selectStays);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const [isDismissed, setIsDismissed] = useLocalStoragePreference(
    `waypoint:travelPrompt:${trip.id}:${currentUserId}`,
    false,
  );
  const [leg, setLeg] = useState<Leg | null>(null);
  const [legSeed, setLegSeed] = useState<NextLegSeed | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canAdd = canCreateItem(trip, currentUserId);
  const isVisible =
    canAdd && isRelativeTrip(trip) && !trip.isArchived && getTripStatus(trip, now) !== 'PAST';

  useEffect(() => {
    if (isVisible) {
      void queryClient.prefetchQuery(airlinesQueryOptions());
      void queryClient.prefetchQuery(airportsQueryOptions());
    }
  }, [isVisible, queryClient]);


  if (!isVisible) {
    return null;
  }

  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const todayIndex = getLocalDayIndex(trip.startDate, now);
  const myTravel = events.filter(
    (event) =>
      !event.isArchived && event.eventType === 'TRAVEL' && isEventForMember(event, memberIds, currentUserId),
  );
  const hasArrival =
    todayIndex > 1 ||
    myTravel.some((event) => (getEventTime(trip, event).endDayIndex ?? Number.POSITIVE_INFINITY) <= 1);
  const hasDeparture = myTravel.some((event) => (getEventTime(trip, event).dayIndex ?? -1) >= dayCount - 2);
  const missing: Leg[] = [...(hasArrival ? [] : (['arrival'] as const)), ...(hasDeparture ? [] : (['departure'] as const))];

  const handleSubmit = async (event: EventFormValues, options?: SubmitOptions) => {
    setIsSubmitting(true);
    try {
      await dispatch(createEvent({ uid: currentUserId, trip, event })).unwrap();
      if (options?.addLeg) {
        setLegSeed({ previous: event, arrivalPlace: options.arrivalPlace ?? null });
        setFormKey((key) => key + 1);
        return;
      }
      setLeg(null);
      setLegSeed(undefined);
      addToast({ title: 'Your travel is on the trip', type: 'success' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openLeg = (nextLeg: Leg) => {
    setLegSeed(undefined);
    setFormKey((key) => key + 1);
    setLeg(nextLeg);
  };

  const modals = (
    <>
      {leg && (
        <EventFormModal
          key={`${leg}-${formKey}`}
          isOpen
          trip={trip}
          currentUserId={currentUserId}
          memberOptions={memberIds.map((uid) => ({
            label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
            value: uid,
          }))}
          prefill={getPrefill(trip, leg, currentUserId)}
          legFrom={legSeed}
          events={events}
          placeBias={getPlaceBiasFromItems([...stays, ...events])}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onClose={() => {
            setLeg(null);
            setLegSeed(undefined);
          }}
        />
      )}
    </>
  );

  if (missing.length === 0) {
    return leg ? modals : null;
  }

  if (isDismissed) {
    return (
      <>
        <p className='text-muted-foreground text-sm'>
          ✈️{' '}
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto px-0! py-0! align-baseline text-sm'
            onClick={() => setIsDismissed(false)}
          >
            Add my travel
          </Button>{' '}
          so the group knows when you arrive.
        </p>
        {modals}
      </>
    );
  }

  return (
    <section className='bg-secondary/70 space-y-3 rounded-2xl p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='font-semibold'>✈️ How are you getting there?</h3>
          <p className='text-muted-foreground text-sm'>
            Add your own way {missing.length === 2 ? 'in and home' : missing[0] === 'arrival' ? 'in' : 'home'}, so the
            group can see who lands when and your Overview shows your trip.
          </p>
        </div>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label='Not now'
          className='-mt-1 -mr-1 shrink-0'
          onClick={() => setIsDismissed(true)}
        >
          <X className='h-4 w-4' />
        </Button>
      </div>
      <div className='flex flex-wrap gap-2'>
        {missing.includes('arrival') && (
          <Button type='button' size='sm' rounded='full' onClick={() => openLeg('arrival')}>
            🛬 My arrival
          </Button>
        )}
        {missing.includes('departure') && (
          <Button type='button' size='sm' rounded='full' onClick={() => openLeg('departure')}>
            🏠 My trip home
          </Button>
        )}
      </div>
      {modals}
    </section>
  );
}

export default TravelPrompts;
