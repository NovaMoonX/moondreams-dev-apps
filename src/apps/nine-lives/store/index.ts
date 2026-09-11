import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import { catsReducer, type CatsState } from './slices/catsSlice';
import {
  householdsReducer,
  type HouseholdsState,
} from './slices/householdsSlice';

export interface NineLivesState {
  households: HouseholdsState;
  cats: CatsState;
}

export const nineLivesReducer = combineReducers({
  households: householdsReducer,
  cats: catsReducer,
});

export const selectNineLives = (state: RootState): NineLivesState =>
  state.nineLives;
