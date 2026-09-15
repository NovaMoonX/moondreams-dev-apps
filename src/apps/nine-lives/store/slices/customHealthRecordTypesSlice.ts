import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { CustomHealthRecordType } from '@apps/nine-lives/types';

export type CustomHealthRecordTypesState =
  OptimisticCollectionState<CustomHealthRecordType>;

export const customHealthRecordTypesSlice =
  createOptimisticCollectionSlice<CustomHealthRecordType>(
    'nineLives/customHealthRecordTypes',
  );

export const {
  setAll: setCustomHealthRecordTypes,
  upsertOneOptimistic: upsertCustomHealthRecordType,
  removeOneOptimistic: removeCustomHealthRecordType,
  revertOne: revertCustomHealthRecordType,
} = customHealthRecordTypesSlice.actions;

export const customHealthRecordTypesReducer =
  customHealthRecordTypesSlice.reducer;

export default customHealthRecordTypesReducer;
