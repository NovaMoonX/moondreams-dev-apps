import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { CustomSymptomQuickTag } from '@apps/nine-lives/types';

export type CustomSymptomQuickTagsState = OptimisticCollectionState<CustomSymptomQuickTag>;

export const customSymptomQuickTagsSlice = createOptimisticCollectionSlice<CustomSymptomQuickTag>(
  'nineLives/customSymptomQuickTags',
);

export const {
  setAll: setCustomSymptomQuickTags,
  upsertOneOptimistic: upsertCustomSymptomQuickTag,
  removeOneOptimistic: removeCustomSymptomQuickTag,
  revertOne: revertCustomSymptomQuickTag,
} = customSymptomQuickTagsSlice.actions;

export const customSymptomQuickTagsReducer = customSymptomQuickTagsSlice.reducer;

export default customSymptomQuickTagsReducer;
