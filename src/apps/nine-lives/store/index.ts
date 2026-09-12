import { combineReducers } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import { catsReducer, type CatsState } from './slices/catsSlice';
import {
  doctorsReducer,
  type DoctorsState,
} from './slices/doctorsSlice';
import {
  householdsReducer,
  type HouseholdsState,
} from './slices/householdsSlice';
import {
  pendingRequestsReducer,
  type PendingRequestsState,
} from './slices/pendingRequestsSlice';
import {
  vetClinicsReducer,
  type VetClinicsState,
} from './slices/vetClinicsSlice';

export interface NineLivesState {
  households: HouseholdsState;
  pendingRequests: PendingRequestsState;
  cats: CatsState;
  vetClinics: VetClinicsState;
  doctors: DoctorsState;
}

export const nineLivesReducer = combineReducers({
  households: householdsReducer,
  pendingRequests: pendingRequestsReducer,
  cats: catsReducer,
  vetClinics: vetClinicsReducer,
  doctors: doctorsReducer,
});

export const selectNineLives = (state: RootState): NineLivesState =>
  state.nineLives;
