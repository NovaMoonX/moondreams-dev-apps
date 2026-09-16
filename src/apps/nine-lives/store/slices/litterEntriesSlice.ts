import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { LitterEntry } from '@apps/nine-lives/types';

export type LitterEntriesState = OptimisticCollectionState<LitterEntry>;

export const litterEntriesSlice = createOptimisticCollectionSlice<LitterEntry>(
  'nineLives/litterEntries',
);

export const {
  setAll: setLitterEntries,
  upsertOneOptimistic: upsertLitterEntry,
  removeOneOptimistic: removeLitterEntry,
  revertOne: revertLitterEntry,
} = litterEntriesSlice.actions;

export const litterEntriesReducer = litterEntriesSlice.reducer;

export default litterEntriesReducer;
