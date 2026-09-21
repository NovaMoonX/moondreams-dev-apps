import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import {
  pendingRequestsReducer,
  type PendingRequestsState,
} from './slices/pendingRequestsSlice';
import { tripReducer, type TripState } from './slices/tripSlice';
import {
  checklistReducer,
  type ChecklistState,
} from './slices/checklistSlice';

export interface WaypointState {
  trip: TripState;
  checklist: ChecklistState;
  pendingRequests: PendingRequestsState;
}

export const waypointReducer = combineReducers({
  trip: tripReducer,
  checklist: checklistReducer,
  pendingRequests: pendingRequestsReducer,
});

export const selectWaypoint = (state: RootState): WaypointState =>
  state.waypoint;

export { type TripState } from './slices/tripSlice';
export { type PendingRequestsState } from './slices/pendingRequestsSlice';
export { type ChecklistState } from './slices/checklistSlice';
