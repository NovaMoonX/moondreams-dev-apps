import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Visit } from '@apps/nine-lives/types';

export type VisitsState = OptimisticCollectionState<Visit>;

export const visitsSlice = createOptimisticCollectionSlice<Visit>('nineLives/visits');

export const {
  setAll: setVisits,
  upsertOneOptimistic: upsertVisit,
  removeOneOptimistic: removeVisit,
  revertOne: revertVisit,
} = visitsSlice.actions;

export const visitsReducer = visitsSlice.reducer;

export default visitsReducer;
