import type { Stay, TimelineEvent } from '@apps/waypoint/types';

type NavigationLocation = Pick<TimelineEvent, 'locationName' | 'address' | 'latitude' | 'longitude'>;

/** A typed location name ("the cabin") isn't something a map can find, so only a place picked from search keeps it. */
export function getEventNavigationLocation(
  event: NavigationLocation & Pick<TimelineEvent, 'place'>,
): NavigationLocation {
  return {
    locationName: event.place ? event.locationName : null,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
  };
}

/** Only a hotel is a business a map knows by name; other stays are found by address. */
export function getStayNavigationLocation(stay: Stay): NavigationLocation {
  return {
    locationName: stay.stayType === 'HOTEL' ? stay.name : null,
    address: stay.address,
    latitude: stay.latitude,
    longitude: stay.longitude,
  };
}
