import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Litter } from '@apps/nine-lives/types';

export type LittersState = OptimisticCollectionState<Litter>;

export const littersSlice = createOptimisticCollectionSlice<Litter>('nineLives/litters');

export const {
  setAll: setLitters,
  upsertOneOptimistic: upsertLitter,
  removeOneOptimistic: removeLitter,
  revertOne: revertLitter,
} = littersSlice.actions;

export const littersReducer = littersSlice.reducer;

export default littersReducer;
