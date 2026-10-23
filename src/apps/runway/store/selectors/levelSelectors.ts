import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getLevel } from '@apps/runway/engine/level';

const NO_PERIODS: never[] = [];
const selectPeriods = (state: RootState) =>
  state.runway.plan?.trackingPeriods ?? NO_PERIODS;

/** Plan or Track, derived from the tracking periods; a plan with none is at Plan. */
export const selectLevel = createSelector([selectPeriods], (periods) =>
  getLevel(periods),
);
