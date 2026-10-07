import { useMemo } from 'react';

import { PillGroup } from '@/components/PillGroup';
import { useAppSelector } from '@/store';
import type { PlaceRef } from '@/lib/places/types';
import { EVENT_TYPE_EMOJIS, STAY_TYPE_EMOJIS } from '@apps/waypoint/constants';
import {
  selectRentals,
  selectSortedTimelineEvents,
  selectStays,
} from '@apps/waypoint/store/selectors';
import type { Rental, Stay, TimelineEvent } from '@apps/waypoint/types';

export interface ItineraryPlace {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: PlaceRef | null;
}

interface ItineraryPick extends ItineraryPlace {
  key: string;
  label: string;
  emoji: string;
}

interface ItineraryPlacePicksProps {
  current: { name: string; address: string };
  excludeEventId?: string;
  onPick: (place: ItineraryPlace) => void;
}

const normalize = (value: string) => value.trim().toLowerCase();

const getPlaceKey = ({ address }: Pick<ItineraryPlace, 'address'>) => normalize(address);

const getEventPicks = (events: TimelineEvent[], excludeEventId?: string): ItineraryPick[] =>
  events
    .filter((event) => !event.isArchived && event.id !== excludeEventId && event.address?.trim())
    .map((event) => {
      const address = event.address?.trim() ?? '';
      return {
        key: getPlaceKey({ address }),
        label: event.locationName?.trim() || address,
        emoji: EVENT_TYPE_EMOJIS[event.eventType],
        name: event.locationName?.trim() || address,
        address,
        latitude: event.latitude,
        longitude: event.longitude,
        place: event.place,
      };
    });

const getStayPicks = (stays: Stay[]): ItineraryPick[] =>
  stays
    .filter((stay) => stay.address.trim())
    .map((stay) => ({
      key: getPlaceKey(stay),
      label: stay.name,
      emoji: STAY_TYPE_EMOJIS[stay.stayType],
      name: stay.name,
      address: stay.address.trim(),
      latitude: stay.latitude,
      longitude: stay.longitude,
      place: stay.place,
    }));

const getRentalPicks = (rentals: Rental[]): ItineraryPick[] =>
  rentals.flatMap((rental) => [
    ...(rental.pickupAddress.trim()
      ? [
          {
            key: getPlaceKey({ address: rental.pickupAddress }),
            label: `${rental.name} pickup`,
            emoji: '🚗',
            name: `${rental.name} pickup`,
            address: rental.pickupAddress.trim(),
            latitude: rental.pickupLatitude,
            longitude: rental.pickupLongitude,
            place: rental.pickupPlace,
          },
        ]
      : []),
    ...(rental.returnAddress?.trim()
      ? [
          {
            key: getPlaceKey({ address: rental.returnAddress }),
            label: `${rental.name} return`,
            emoji: '🚗',
            name: `${rental.name} return`,
            address: rental.returnAddress.trim(),
            latitude: rental.returnLatitude,
            longitude: rental.returnLongitude,
            place: rental.returnPlace,
          },
        ]
      : []),
  ]);

function getItineraryPicks(
  stays: Stay[],
  rentals: Rental[],
  events: TimelineEvent[],
  excludeEventId?: string,
): ItineraryPick[] {
  const picks = [...getStayPicks(stays), ...getRentalPicks(rentals), ...getEventPicks(events, excludeEventId)].reduce(
    (byKey, pick) => (byKey.has(pick.key) ? byKey : byKey.set(pick.key, pick)),
    new Map<string, ItineraryPick>(),
  );
  return Array.from(picks.values());
}

function ItineraryPlacePicks({ current, excludeEventId, onPick }: ItineraryPlacePicksProps) {
  const stays = useAppSelector(selectStays);
  const rentals = useAppSelector(selectRentals);
  const events = useAppSelector(selectSortedTimelineEvents);
  const picks = useMemo(
    () => getItineraryPicks(stays, rentals, events, excludeEventId),
    [stays, rentals, events, excludeEventId],
  );
  const selected = picks.find(
    (pick) => normalize(pick.address) === normalize(current.address) && normalize(pick.name) === normalize(current.name),
  );

  if (picks.length === 0) {
    return null;
  }

  return (
    <div className='mt-2 space-y-2'>
      <p className='text-muted-foreground text-xs'>Or pick a place on your itinerary</p>
      <PillGroup
        label='Places on your itinerary'
        options={picks.map((pick) => ({ value: pick.key, label: pick.label, emoji: pick.emoji }))}
        value={selected?.key ?? null}
        onChange={(key) => {
          const pick = picks.find((candidate) => candidate.key === key);
          if (pick) {
            onPick({
              name: pick.name,
              address: pick.address,
              latitude: pick.latitude,
              longitude: pick.longitude,
              place: pick.place,
            });
          }
        }}
      />
    </div>
  );
}

export default ItineraryPlacePicks;
