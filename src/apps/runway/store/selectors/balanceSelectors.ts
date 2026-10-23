import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { deriveBalances } from '@apps/runway/engine/balances';

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
