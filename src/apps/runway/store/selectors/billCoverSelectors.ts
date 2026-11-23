import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  coverBalances,
  getBillCover,
  type CoveredBalances,
} from '@apps/runway/engine/figures';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectLedgerOnlyBalances,
  selectBankBacking,
} from '@apps/runway/store/selectors/balanceSelectors';
import { selectUsableSnapshot } from '@apps/runway/store/selectors/figuresSnapshotSelectors';
import {
  selectBillPayments,
  selectBills,
  selectComingDays,
  selectIsLedgerReady,
} from '@apps/runway/store/selectors/runwaySelectors';

export type { CoveredBalances };

const selectToday = () => todayAsUtcDate();

/** The server's stored figures while the ledger is still being read and they still describe the plan; null otherwise, so every figure below is the phone's own once it is read. */
const selectHeadStart = (state: RootState) =>
  selectIsLedgerReady(state)
    ? null
    : (selectUsableSnapshot(state, todayAsUtcDate())?.figures ?? null);

/** What Free to Spend sets aside for bills its pays won't carry in time, from the phone's own ledger. */
export const selectOwnBillCover = createSelector(
  [
    selectLedgerOnlyBalances,
    (state: RootState) => selectBills(state, todayAsUtcDate()),
    (state: RootState) => selectBillPayments(state, todayAsUtcDate()),
    (state: RootState) => selectComingDays(state, todayAsUtcDate()),
    selectToday,
  ],
  getBillCover,
);

const selectOwnBalances = createSelector(
  [selectLedgerOnlyBalances, selectOwnBillCover],
  coverBalances,
);

export const selectBillCover = (state: RootState) =>
  selectHeadStart(state)?.billCover ?? selectOwnBillCover(state);

/** Every balance summed from the ledger and never stored, with the bills Free to Spend covers held for them; until the ledger is read, the server's stored figures. */
export const selectBalances = (state: RootState): CoveredBalances =>
  selectHeadStart(state)?.balances ?? selectOwnBalances(state);

/** Whether Free to Spend comes from the account balances; until the ledger is read, the server's stored answer. */
export const selectDrawnBankBacking = (state: RootState) =>
  selectHeadStart(state)?.bankBacking ?? selectBankBacking(state);

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
