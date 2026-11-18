import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { buildParentIndex } from '@apps/helm/utils/privacyParents';

export const selectParentIndex = createSelector(
  [
    (state: RootState) => state.helm.projects.items,
    (state: RootState) => state.helm.who.items,
    (state: RootState) => state.helm.places.items,
  ],
  (projects, who, places) => buildParentIndex(projects, who, places),
);
