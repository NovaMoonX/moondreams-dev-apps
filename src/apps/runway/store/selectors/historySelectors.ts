import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  getHistory,
  type ClosingState,
  type History,
} from '@apps/runway/engine/closings';
import type { DateOnly } from '@apps/runway/types';

/** How the history stands: `loading` until the plan and the closing it points to are read, then what `getHistory` says. */
export type HistoryView = { status: 'loading' } | History;

const LOADING: HistoryView = { status: 'loading' };

const selectStartDate = (state: RootState) =>
  state.runway.plan?.startDate ?? null;
const selectDirtyFrom = (state: RootState) =>
  state.runway.plan?.dirtyFrom ?? null;
const selectIsPlanLoaded = (state: RootState) =>
  state.runway.isLoaded && state.runway.plan !== null;

/** The `dirtyFrom` a closing read is keyed on. */
export const toClosingKey = (dirtyFrom: string | null) => dirtyFrom ?? 'none';

export const selectHistory = createSelector(
  [
    selectIsPlanLoaded,
    selectStartDate,
    selectDirtyFrom,
    (state: RootState) => state.runway.closing,
    (state: RootState) => state.runway.closingFor,
    (state: RootState) => state.runway.loadDay,
    (state: RootState) => state.runway.failedRebuild,
  ],
  (
    isPlanLoaded,
    startDate,
    dirtyFrom,
    closing,
    closingFor,
    loadDay,
    failedRebuild,
  ): HistoryView => {
    if (
      !isPlanLoaded ||
      loadDay === null ||
      closingFor !== toClosingKey(dirtyFrom)
    ) {
      return LOADING;
    }
    const input = { startDate, dirtyFrom, closing, today: loadDay };
    const history = getHistory({ ...input, hasFailed: false });
    if (
      history.status === 'building' &&
      failedRebuild === JSON.stringify(history.need)
    ) {
      return getHistory({ ...input, hasFailed: true });
    }
    return history;
  },
);

/** Where the recent window starts, or null while the history is not ready. */
export const selectRecentFrom = (state: RootState): DateOnly | null => {
  const history = selectHistory(state);
  return history.status === 'ready' ? history.from : null;
};

/** The closing the ledger read since is added to; null when none applies. */
export const selectClosingBase = (state: RootState): ClosingState | null => {
  const history = selectHistory(state);
  return history.status === 'ready' ? history.closing : null;
};

/** True once the days, moves and purchases of the window the history points to are read. */
export const selectIsWindowLoaded = (state: RootState) => {
  const from = selectRecentFrom(state);
  return (
    from !== null &&
    state.runway.movesFrom === from &&
    state.runway.purchasesFrom === from
  );
};

/** The rebuild the history is waiting for as a string that changes only when the work does, or '' when none is. */
export const selectRebuildNeedKey = (state: RootState): string => {
  const history = selectHistory(state);
  return history.status === 'building' ? JSON.stringify(history.need) : '';
};
