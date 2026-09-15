import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { HealthRecord } from '@apps/nine-lives/types';

export type HealthRecordsState = OptimisticCollectionState<HealthRecord>;

export const healthRecordsSlice = createOptimisticCollectionSlice<HealthRecord>(
  'nineLives/healthRecords',
);

export const {
  setAll: setHealthRecords,
  upsertOneOptimistic: upsertHealthRecord,
  removeOneOptimistic: removeHealthRecord,
  revertOne: revertHealthRecord,
} = healthRecordsSlice.actions;

export const healthRecordsReducer = healthRecordsSlice.reducer;

export default healthRecordsReducer;
