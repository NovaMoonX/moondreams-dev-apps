import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  coverBalances,
  getBillCover,
  type CoveredBalances,
} from '@apps/runway/engine/figures';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectLedgerOnlyBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBillPayments,
  selectBills,
  selectComingDays,
} from '@apps/runway/store/selectors/runwaySelectors';

export type { CoveredBalances };

const selectToday = () => todayAsUtcDate();

/** What Free to Spend sets aside for bills its pays won't carry in time. */
export const selectBillCover = createSelector(
  [
    selectLedgerOnlyBalances,
    (state: RootState) => selectBills(state, todayAsUtcDate()),
    (state: RootState) => selectBillPayments(state, todayAsUtcDate()),
    (state: RootState) => selectComingDays(state, todayAsUtcDate()),
    selectToday,
  ],
  getBillCover,
);

/** Every balance summed from the ledger and never stored, with the bills Free to Spend covers held for them. */
export const selectBalances = createSelector(
  [selectLedgerOnlyBalances, selectBillCover],
  coverBalances,
);

export const selectFreeToSpend = (state: RootState) =>
  selectBalances(state).freeToSpendCents;

/** What one envelope has been assigned since the starting point. */
export const selectEnvelopeFigure = (state: RootState, itemId: string) =>
  selectLedgerOnlyBalances(state).assignedByItem[itemId] ?? 0;

/** What a place holds now; null is Free to Spend. */
export const selectHeldBy = (state: RootState, placeId: string | null) =>
  placeId === null
    ? selectFreeToSpend(state)
    : selectEnvelopeFigure(state, placeId);
