import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { LitterBox } from '@apps/nine-lives/types';

export type LitterBoxesState = OptimisticCollectionState<LitterBox>;

export const litterBoxesSlice = createOptimisticCollectionSlice<LitterBox>(
  'nineLives/litterBoxes',
);

export const {
  setAll: setLitterBoxes,
  upsertOneOptimistic: upsertLitterBox,
  removeOneOptimistic: removeLitterBox,
  revertOne: revertLitterBox,
} = litterBoxesSlice.actions;

export const litterBoxesReducer = litterBoxesSlice.reducer;

export default litterBoxesReducer;
