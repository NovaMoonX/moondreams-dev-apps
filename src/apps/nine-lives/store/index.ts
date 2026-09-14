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
  symptomsReducer,
  type SymptomsState,
} from './slices/symptomsSlice';
import {
  vaccinationsReducer,
  type VaccinationsState,
} from './slices/vaccinationsSlice';
import {
  vetClinicsReducer,
  type VetClinicsState,
} from './slices/vetClinicsSlice';
import {
  weightEntriesReducer,
  type WeightEntriesState,
} from './slices/weightEntriesSlice';

export interface NineLivesState {
  households: HouseholdsState;
  pendingRequests: PendingRequestsState;
  cats: CatsState;
  vetClinics: VetClinicsState;
  doctors: DoctorsState;
  symptoms: SymptomsState;
  vaccinations: VaccinationsState;
  weightEntries: WeightEntriesState;
}

export const nineLivesReducer = combineReducers({
  households: householdsReducer,
  pendingRequests: pendingRequestsReducer,
  cats: catsReducer,
  vetClinics: vetClinicsReducer,
  doctors: doctorsReducer,
  symptoms: symptomsReducer,
  vaccinations: vaccinationsReducer,
  weightEntries: weightEntriesReducer,
});

export const selectNineLives = (state: RootState): NineLivesState =>
  state.nineLives;
