import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { IngestionDraft } from '@apps/nine-lives/types';

export type IngestionDraftsState = OptimisticCollectionState<IngestionDraft>;

export const ingestionDraftsSlice = createOptimisticCollectionSlice<IngestionDraft>(
  'nineLives/ingestionDrafts',
);

export const {
  setAll: setIngestionDrafts,
  upsertOneOptimistic: upsertIngestionDraft,
  removeOneOptimistic: removeIngestionDraft,
  revertOne: revertIngestionDraft,
} = ingestionDraftsSlice.actions;

export const ingestionDraftsReducer = ingestionDraftsSlice.reducer;

export default ingestionDraftsReducer;
