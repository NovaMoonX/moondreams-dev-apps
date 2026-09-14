import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Symptom } from '@apps/nine-lives/types';

export type SymptomsState = OptimisticCollectionState<Symptom>;

export const symptomsSlice = createOptimisticCollectionSlice<Symptom>(
  'nineLives/symptoms',
);

export const {
  setAll: setSymptoms,
  upsertOneOptimistic: upsertSymptom,
  removeOneOptimistic: removeSymptom,
  revertOne: revertSymptom,
} = symptomsSlice.actions;

export const symptomsReducer = symptomsSlice.reducer;

export default symptomsReducer;
