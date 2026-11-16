import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

const selectItems = (state: RootState) => state.helm.research.items;

/** Every research item whose words opened, newest first. */
export const selectResearch = createSelector([selectItems], (items) =>
  items.filter((one) => !one.isUnreadable),
);
