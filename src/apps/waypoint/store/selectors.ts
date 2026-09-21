import type { RootState } from '@/store';

export const selectTrips = (state: RootState) => state.waypoint.trip.items;

export const selectTripById =
  (tripId: string | null | undefined) => (state: RootState) =>
    tripId
      ? (state.waypoint.trip.items.find((trip) => trip.id === tripId) ?? null)
      : null;

export const selectTimelineEvents = (state: RootState) => state.waypoint.events.items;

export const selectEventsByDay =
  (dayIndex: number) => (state: RootState) =>
    state.waypoint.events.items.filter((event) => event.dayIndex === dayIndex);
