import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { WeightEntry } from '@apps/nine-lives/types';

export type WeightEntriesState = OptimisticCollectionState<WeightEntry>;

export const weightEntriesSlice = createOptimisticCollectionSlice<WeightEntry>(
  'nineLives/weightEntries',
);

export const {
  setAll: setWeightEntries,
  upsertOneOptimistic: upsertWeightEntry,
  removeOneOptimistic: removeWeightEntry,
  revertOne: revertWeightEntry,
} = weightEntriesSlice.actions;

export const weightEntriesReducer = weightEntriesSlice.reducer;

export default weightEntriesReducer;
