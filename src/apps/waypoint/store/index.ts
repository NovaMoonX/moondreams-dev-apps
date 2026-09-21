import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import {
  pendingRequestsReducer,
  type PendingRequestsState,
} from './slices/pendingRequestsSlice';
import { tripReducer, type TripState } from './slices/tripSlice';
import {
  expensesReducer,
  type ExpensesState,
} from './slices/expensesSlice';
import { eventsReducer, type EventsState } from './slices/eventsSlice';
import {
  checklistReducer,
  type ChecklistState,
} from './slices/checklistSlice';

export interface WaypointState {
  trip: TripState;
  expenses: ExpensesState;
  events: EventsState;
  checklist: ChecklistState;
  pendingRequests: PendingRequestsState;
}

export const waypointReducer = combineReducers({
  trip: tripReducer,
  expenses: expensesReducer,
  events: eventsReducer,
  checklist: checklistReducer,
  pendingRequests: pendingRequestsReducer,
});

export const selectWaypoint = (state: RootState): WaypointState =>
  state.waypoint;

export { type TripState } from './slices/tripSlice';
export { type PendingRequestsState } from './slices/pendingRequestsSlice';
export { type ExpensesState } from './slices/expensesSlice';
export { type EventsState } from './slices/eventsSlice';
export { type ChecklistState } from './slices/checklistSlice';
