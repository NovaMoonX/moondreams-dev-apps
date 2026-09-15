import type { RootState } from '@/store';

export const selectTrips = (state: RootState) => state.waypoint.trip.items;

export const selectTripById =
  (tripId: string | null | undefined) => (state: RootState) =>
    tripId
      ? (state.waypoint.trip.items.find((trip) => trip.id === tripId) ?? null)
      : null;
