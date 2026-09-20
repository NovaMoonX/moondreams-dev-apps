import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { CustomLitterType } from '@apps/nine-lives/types';

export type CustomLitterTypesState = OptimisticCollectionState<CustomLitterType>;

export const customLitterTypesSlice = createOptimisticCollectionSlice<CustomLitterType>(
  'nineLives/customLitterTypes',
);

export const {
  setAll: setCustomLitterTypes,
  upsertOneOptimistic: upsertCustomLitterType,
  removeOneOptimistic: removeCustomLitterType,
  revertOne: revertCustomLitterType,
} = customLitterTypesSlice.actions;

export const customLitterTypesReducer = customLitterTypesSlice.reducer;

export default customLitterTypesReducer;
