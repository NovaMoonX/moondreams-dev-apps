import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { LibraryCondition } from '@apps/nine-lives/types';

export type ConditionLibraryState = OptimisticCollectionState<LibraryCondition>;

export const conditionLibrarySlice = createOptimisticCollectionSlice<LibraryCondition>(
  'nineLives/conditionLibrary',
);

export const {
  setAll: setConditionLibrary,
  upsertOneOptimistic: upsertConditionLibraryItem,
  removeOneOptimistic: removeConditionLibraryItem,
  revertOne: revertConditionLibraryItem,
} = conditionLibrarySlice.actions;

export const conditionLibraryReducer = conditionLibrarySlice.reducer;

export default conditionLibraryReducer;
