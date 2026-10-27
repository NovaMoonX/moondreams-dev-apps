import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectClosingBase } from '@apps/runway/store/selectors/historySelectors';
import { withoutSpending } from '@apps/runway/engine/closings';
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
    selectClosingBase,
  ],
  (
    startDate,
    moves,
    records,
    days,
    items,
    purchases,
    level,
    closing,
  ): BalancesInput => ({
    startDate,
    moves,
    records,
    arrivedOn: new Map(
      days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
    ),
    expectedOn: new Map(days.map((day) => [day.id, day.expectedOn])),
    purchases: level === 'track' ? purchases : [],
    closing:
      closing !== null && level !== 'track'
        ? withoutSpending(closing)
        : closing,
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
