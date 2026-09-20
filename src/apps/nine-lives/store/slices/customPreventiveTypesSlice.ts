import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { CustomPreventiveType } from '@apps/nine-lives/types';

export type CustomPreventiveTypesState =
  OptimisticCollectionState<CustomPreventiveType>;

export const customPreventiveTypesSlice =
  createOptimisticCollectionSlice<CustomPreventiveType>(
    'nineLives/customPreventiveTypes',
  );

export const {
  setAll: setCustomPreventiveTypes,
  upsertOneOptimistic: upsertCustomPreventiveType,
  removeOneOptimistic: removeCustomPreventiveType,
  revertOne: revertCustomPreventiveType,
} = customPreventiveTypesSlice.actions;

export const customPreventiveTypesReducer =
  customPreventiveTypesSlice.reducer;

export default customPreventiveTypesReducer;
