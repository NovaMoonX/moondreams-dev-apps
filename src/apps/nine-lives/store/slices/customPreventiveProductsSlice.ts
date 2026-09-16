import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { CustomPreventiveProduct } from '@apps/nine-lives/types';

export type CustomPreventiveProductsState =
  OptimisticCollectionState<CustomPreventiveProduct>;

export const customPreventiveProductsSlice =
  createOptimisticCollectionSlice<CustomPreventiveProduct>(
    'nineLives/customPreventiveProducts',
  );

export const {
  setAll: setCustomPreventiveProducts,
  upsertOneOptimistic: upsertCustomPreventiveProduct,
  removeOneOptimistic: removeCustomPreventiveProduct,
  revertOne: revertCustomPreventiveProduct,
} = customPreventiveProductsSlice.actions;

export const customPreventiveProductsReducer =
  customPreventiveProductsSlice.reducer;

export default customPreventiveProductsReducer;
