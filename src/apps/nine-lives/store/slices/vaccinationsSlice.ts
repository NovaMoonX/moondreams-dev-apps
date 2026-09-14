import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Vaccination } from '@apps/nine-lives/types';

export type VaccinationsState = OptimisticCollectionState<Vaccination>;

export const vaccinationsSlice = createOptimisticCollectionSlice<Vaccination>(
  'nineLives/vaccinations',
);

export const {
  setAll: setVaccinations,
  upsertOneOptimistic: upsertVaccination,
  removeOneOptimistic: removeVaccination,
  revertOne: revertVaccination,
} = vaccinationsSlice.actions;

export const vaccinationsReducer = vaccinationsSlice.reducer;

export default vaccinationsReducer;
