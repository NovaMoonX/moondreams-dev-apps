import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Preventive } from '@apps/nine-lives/types';

export type PreventivesState = OptimisticCollectionState<Preventive>;

export const preventivesSlice = createOptimisticCollectionSlice<Preventive>(
  'nineLives/preventives',
);

export const {
  setAll: setPreventives,
  upsertOneOptimistic: upsertPreventive,
  removeOneOptimistic: removePreventive,
  revertOne: revertPreventive,
} = preventivesSlice.actions;

export const preventivesReducer = preventivesSlice.reducer;

export default preventivesReducer;
