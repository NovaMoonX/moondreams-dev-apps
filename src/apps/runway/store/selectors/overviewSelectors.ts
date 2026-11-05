import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBillPayments,
  selectBills,
  selectComingDays,
  selectCostPaid,
  selectHorizonItems,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import type { Priority } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

const selectOn = (_state: RootState, on: number) => on;
const selectDial = (_state: RootState, _on: number, dial: Priority) => dial;

/** What the bills still unpaid at or above `dial` ask before the next pay arrives, a bill due on the pay day itself left to that pay; null when no pay is coming. */
export const selectBillsDueBeforePay = createSelector(
  [selectBillPayments, selectComingDays, selectBills, selectDial],
  (payments, comingDays, bills, dial): number | null => {
    const nextPay = comingDays[0];
    if (!nextPay) return null;
    return bills
      .filter(({ version }) => isCountedAt(version.payload.priority, dial))
      .flatMap(({ item }) => payments[item.id] ?? [])
      .filter(({ paid, dueOn }) => paid === null && dueOn < nextPay.on)
      .reduce((sum, { totalCents }) => sum + totalCents, 0);
  },
);

/** What the Horizon items together fall short of what their costs ask, each as its row and sheet work it out. */
export const selectHorizonShortCents = createSelector(
  [selectHorizonItems, selectBalances, selectCostPaid, selectStance, selectOn],
  (items, balances, costPaid, stance, today): number =>
    items.reduce(
      (sum, { item, version }) =>
        sum +
        (getHorizonStatus(
          version.payload,
          balances.assignedByItem[item.id] ?? 0,
          today,
          stance,
          costPaid[item.id],
          balances.costPaidByItem[item.id] ?? 0,
          balances.costFromFreeByItem[item.id] ?? 0,
        ).plan.shortfall?.totalShortCents ?? 0),
      0,
    ),
);
