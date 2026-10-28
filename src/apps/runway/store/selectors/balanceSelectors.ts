import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  deriveBalances,
  type BalancesInput,
} from '@apps/runway/engine/balances';

/** What the balances are summed from. */
export const selectBalanceInputs = createSelector(
  [
    (state: RootState) => state.runway.plan?.startDate ?? null,
    (state: RootState) => state.runway.moves,
    (state: RootState) => state.runway.records,
    (state: RootState) => state.runway.days,
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.purchases,
    selectLevel,
  ],
  (
    startDate,
    moves,
    records,
    days,
    items,
    purchases,
    level,
  ): BalancesInput => ({
    startDate,
    moves,
    records,
    arrivedOn: new Map(
      days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
    ),
    purchases: level === 'track' ? purchases : [],
    kinds: Object.fromEntries(
      items.flatMap((item) =>
        item.kind === 'goal' || item.kind === 'bill' || item.kind === 'envelope'
          ? [[item.id, item.kind] as const]
          : [],
      ),
    ),
  }),
);

/** Every balance, summed from the ledger since the starting point and never stored. */
export const selectBalances = createSelector(
  [selectBalanceInputs],
  deriveBalances,
);

export const selectFreeToSpend = (state: RootState) =>
  selectBalances(state).freeToSpendCents;

/** What one envelope has been assigned since the starting point. */
export const selectEnvelopeFigure = (state: RootState, itemId: string) =>
  selectBalances(state).assignedByItem[itemId] ?? 0;
