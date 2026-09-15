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
  conditionLibraryReducer,
  type ConditionLibraryState,
} from './slices/conditionLibrarySlice';
import {
  catConditionsReducer,
  type CatConditionsState,
} from './slices/catConditionsSlice';
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
  conditionLibrary: ConditionLibraryState;
  catConditions: CatConditionsState;
  vaccinations: VaccinationsState;
  weightEntries: WeightEntriesState;
}

export const nineLivesReducer = combineReducers({
  households: householdsReducer,
  pendingRequests: pendingRequestsReducer,
  cats: catsReducer,
  vetClinics: vetClinicsReducer,
  doctors: doctorsReducer,
  conditionLibrary: conditionLibraryReducer,
  catConditions: catConditionsReducer,
  vaccinations: vaccinationsReducer,
  weightEntries: weightEntriesReducer,
});

export const selectNineLives = (state: RootState): NineLivesState =>
  state.nineLives;
