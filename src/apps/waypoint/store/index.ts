import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import { tripReducer, type TripState } from './slices/tripSlice';

export interface WaypointState {
  trip: TripState;
}

export const waypointReducer = combineReducers({
  trip: tripReducer,
});

export const selectWaypoint = (state: RootState): WaypointState =>
  state.waypoint;

export { type TripState } from './slices/tripSlice';
