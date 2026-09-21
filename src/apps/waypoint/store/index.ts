import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import {
  pendingRequestsReducer,
  type PendingRequestsState,
} from './slices/pendingRequestsSlice';
import { tripReducer, type TripState } from './slices/tripSlice';
import { eventsReducer, type EventsState } from './slices/eventsSlice';

export interface WaypointState {
  trip: TripState;
  events: EventsState;
  pendingRequests: PendingRequestsState;
}

export const waypointReducer = combineReducers({
  trip: tripReducer,
  events: eventsReducer,
  pendingRequests: pendingRequestsReducer,
});

export const selectWaypoint = (state: RootState): WaypointState =>
  state.waypoint;

export { type TripState } from './slices/tripSlice';
export { type PendingRequestsState } from './slices/pendingRequestsSlice';
export { type EventsState } from './slices/eventsSlice';
