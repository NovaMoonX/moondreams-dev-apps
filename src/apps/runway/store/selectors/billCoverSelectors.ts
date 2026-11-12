import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { computeBillCover, type BillCover } from '@apps/runway/engine/billCover';
import type { Balances } from '@apps/runway/engine/balances';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectLedgerOnlyBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBillPayments,
  selectBills,
  selectComingDays,
} from '@apps/runway/store/selectors/runwaySelectors';

/** The balances with the bills Free to Spend covers taken out of it and counted as held for bills. */
export interface CoveredBalances extends Balances {
  /** What the ledger alone holds for bills, before the cover. */
  ledgerBillsCents: number;
  billCover: BillCover;
}

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
  (balances, bills, payments, comingDays, today): BillCover =>
    computeBillCover({
      today,
      bills: bills.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        isDated: version.payload.timing.schedule.anchor !== null,
      })),
      payments,
      nextPayOn: comingDays.find((day) => day.on >= today)?.on ?? null,
      freeToSpendCents:
        balances.isStarted && balances.hasMoney
          ? balances.freeToSpendCents
          : 0,
    }),
);

/** Every balance summed from the ledger and never stored, with the bills Free to Spend covers held for them. */
export const selectBalances = createSelector(
  [selectLedgerOnlyBalances, selectBillCover],
  (balances, billCover): CoveredBalances => ({
    ...balances,
    ledgerBillsCents: balances.assignedToBillsCents,
    assignedToBillsCents: balances.assignedToBillsCents + billCover.coveredCents,
    freeToSpendCents: balances.freeToSpendCents - billCover.coveredCents,
    billCover,
  }),
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
