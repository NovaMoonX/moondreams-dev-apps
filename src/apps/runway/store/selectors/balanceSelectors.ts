import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { deriveBalances } from '@apps/runway/engine/balances';
import { getBillCoverage } from '@apps/runway/engine/coverage';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  selectBillPayments,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';

const selectOn = (_state: RootState, on: number) => on;

/** Every balance, summed from the ledger since the starting point and never stored. */
export const selectBalances = createSelector(
  [
    (state: RootState) => state.runway.plan?.startDate ?? null,
    (state: RootState) => state.runway.moves,
    (state: RootState) => state.runway.records,
    (state: RootState) => state.runway.days,
    (state: RootState) => state.runway.items,
  ],
  (startDate, moves, records, days, items) =>
    deriveBalances({
      startDate,
      moves,
      records,
      arrivedOn: new Map(
        days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
      ),
      kinds: Object.fromEntries(
        items.flatMap((item) =>
          item.kind === 'goal' ||
          item.kind === 'bill' ||
          item.kind === 'envelope'
            ? [[item.id, item.kind] as const]
            : [],
        ),
      ),
    }),
);

export const selectFreeToSpend = (state: RootState) =>
  selectBalances(state).freeToSpendCents;

/** What one envelope has been assigned since the starting point. */
export const selectEnvelopeFigure = (state: RootState, itemId: string) =>
  selectBalances(state).assignedByItem[itemId] ?? 0;

/** How far the plan sets bills aside, or that there are no bills yet. */
export const selectBillCoverage = createSelector(
  [selectBills, selectBillPayments, selectOn],
  (bills, payments, today) =>
    getBillCoverage(
      bills.map(({ item }) => item.id),
      payments,
      today,
      addUtcMonths(today, LOOKAHEAD_MONTHS),
    ),
);
