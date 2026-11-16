import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenResearch } from '@apps/helm/types';

const selectItems = (state: RootState) => state.helm.research.items;

/** Every research item whose words opened, newest first. */
export const selectResearch = createSelector([selectItems], (items) =>
  items.filter((one) => !one.isUnreadable),
);

export const selectResearchById = (
  state: RootState,
  id: string,
): OpenResearch | null =>
  selectItems(state).find((one) => one.id === id && !one.isUnreadable) ?? null;

export const selectResearchByCaptureId = createSelector(
  [selectResearch, (_state: RootState, captureId: string) => captureId],
  (items, captureId) => items.filter((one) => one.captureId === captureId),
);
