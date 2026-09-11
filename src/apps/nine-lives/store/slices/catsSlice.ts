import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Cat } from '@apps/nine-lives/types';

export type CatsState = OptimisticCollectionState<Cat>;

export const catsSlice = createOptimisticCollectionSlice<Cat>('nineLives/cats');

export const {
  setAll: setCats,
  upsertOneOptimistic: upsertCat,
  removeOneOptimistic: removeCat,
  revertOne: revertCat,
} = catsSlice.actions;

export const catsReducer = catsSlice.reducer;

export default catsReducer;
