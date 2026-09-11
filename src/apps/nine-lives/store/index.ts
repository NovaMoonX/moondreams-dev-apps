import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import {
  householdsReducer,
  type HouseholdsState,
} from './slices/householdsSlice';

export interface NineLivesState {
  households: HouseholdsState;
}

export const nineLivesReducer = combineReducers({
  households: householdsReducer,
});

export const selectNineLives = (state: RootState): NineLivesState =>
  state.nineLives;
