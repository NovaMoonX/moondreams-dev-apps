import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { CatCondition } from '@apps/nine-lives/types';

export type CatConditionsState = OptimisticCollectionState<CatCondition>;

export const catConditionsSlice = createOptimisticCollectionSlice<CatCondition>(
  'nineLives/catConditions',
);

export const {
  setAll: setCatConditions,
  upsertOneOptimistic: upsertCatCondition,
  removeOneOptimistic: removeCatCondition,
  revertOne: revertCatCondition,
} = catConditionsSlice.actions;

export const catConditionsReducer = catConditionsSlice.reducer;

export default catConditionsReducer;
