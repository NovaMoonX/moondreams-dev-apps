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
  conditionLibraryReducer,
  type ConditionLibraryState,
} from './slices/conditionLibrarySlice';
import {
  catConditionsReducer,
  type CatConditionsState,
} from './slices/catConditionsSlice';
import {
  expensesReducer,
  type ExpensesState,
} from './slices/expensesSlice';
import {
  vaccinationsReducer,
  type VaccinationsState,
} from './slices/vaccinationsSlice';
import {
  preventivesReducer,
  type PreventivesState,
} from './slices/preventivesSlice';
import {
  vetClinicsReducer,
  type VetClinicsState,
} from './slices/vetClinicsSlice';
import {
  weightEntriesReducer,
  type WeightEntriesState,
} from './slices/weightEntriesSlice';
import {
  visitsReducer,
  type VisitsState,
} from './slices/visitsSlice';
import {
  healthRecordsReducer,
  type HealthRecordsState,
} from './slices/healthRecordsSlice';
import {
  customHealthRecordTypesReducer,
  type CustomHealthRecordTypesState,
} from './slices/customHealthRecordTypesSlice';
import {
  litterEntriesReducer,
  type LitterEntriesState,
} from './slices/litterEntriesSlice';
import {
  customPreventiveProductsReducer,
  type CustomPreventiveProductsState,
} from './slices/customPreventiveProductsSlice';
import {
  customPreventiveTypesReducer,
  type CustomPreventiveTypesState,
} from './slices/customPreventiveTypesSlice';

export interface NineLivesState {
  households: HouseholdsState;
  pendingRequests: PendingRequestsState;
  cats: CatsState;
  vetClinics: VetClinicsState;
  doctors: DoctorsState;
  symptoms: SymptomsState;
  conditionLibrary: ConditionLibraryState;
  catConditions: CatConditionsState;
  expenses: ExpensesState;
  vaccinations: VaccinationsState;
  preventives: PreventivesState;
  weightEntries: WeightEntriesState;
  visits: VisitsState;
  healthRecords: HealthRecordsState;
  customHealthRecordTypes: CustomHealthRecordTypesState;
  litterEntries: LitterEntriesState;
  customPreventiveProducts: CustomPreventiveProductsState;
  customPreventiveTypes: CustomPreventiveTypesState;
}

export const nineLivesReducer = combineReducers({
  households: householdsReducer,
  pendingRequests: pendingRequestsReducer,
  cats: catsReducer,
  vetClinics: vetClinicsReducer,
  doctors: doctorsReducer,
  symptoms: symptomsReducer,
  conditionLibrary: conditionLibraryReducer,
  catConditions: catConditionsReducer,
  expenses: expensesReducer,
  vaccinations: vaccinationsReducer,
  preventives: preventivesReducer,
  weightEntries: weightEntriesReducer,
  visits: visitsReducer,
  healthRecords: healthRecordsReducer,
  customHealthRecordTypes: customHealthRecordTypesReducer,
  litterEntries: litterEntriesReducer,
  customPreventiveProducts: customPreventiveProductsReducer,
  customPreventiveTypes: customPreventiveTypesReducer,
});

export const selectNineLives = (state: RootState): NineLivesState =>
  state.nineLives;
