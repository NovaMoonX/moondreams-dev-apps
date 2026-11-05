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
import {
  getCostPriority,
  sumCountedShortCents,
  getHorizonPaceCents,
  getLiveCosts,
} from '@apps/runway/engine/horizon';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import type { Priority } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

const selectOn = (_state: RootState, on: number) => on;
const selectDial = (_state: RootState, _on: number, dial: Priority) => dial;

/** The steady amount a month the costs of open Horizon items counted at `dial` need, each cost at its own priority, to meet every payment on its due date from what is not yet held; the usual-month basis the dated goals use. */
export const selectHorizonMonthCents = createSelector(
  [
    selectHorizonItems,
    selectBalances,
    selectCostPaid,
    selectStance,
    selectOn,
    selectDial,
  ],
  (items, balances, costPaid, stance, today, dial): number =>
    items.reduce(
      (sum, { item, version }) =>
        sum +
        getHorizonPaceCents(
          getHorizonStatus(
            version.payload,
            balances.assignedByItem[item.id] ?? 0,
            today,
            stance,
            costPaid[item.id],
            balances.costPaidByItem[item.id] ?? 0,
            balances.costFromFreeByItem[item.id] ?? 0,
          ).plan.covers,
          new Set(
            getLiveCosts(version.payload)
              .filter((cost) =>
                isCountedAt(
                  getCostPriority(cost, version.payload.priority),
                  dial,
                ),
              )
              .map(({ id }) => id),
          ),
          today,
        ),
      0,
    ),
);

/** What the bills still unpaid at or above `dial` ask before the next pay arrives, a bill due on the pay day itself left to that pay; null when no pay is coming; `payOn` is that pay's day. */
export const selectBillsDueBeforePay = createSelector(
  [selectBillPayments, selectComingDays, selectBills, selectDial],
  (
    payments,
    comingDays,
    bills,
    dial,
  ): { cents: number; payOn: number } | null => {
    const nextPay = comingDays[0];
    if (!nextPay) return null;
    const cents = bills
      .filter(({ version }) => isCountedAt(version.payload.priority, dial))
      .flatMap(({ item }) => payments[item.id] ?? [])
      .filter(({ paid, dueOn }) => paid === null && dueOn < nextPay.on)
      .reduce((sum, { totalCents }) => sum + totalCents, 0);
    return { cents, payOn: nextPay.on };
  },
);

/** What the Horizon costs at or above `dial`, each at its own priority, together fall short of what they ask, each as its row and sheet work it out. */
export const selectHorizonShortCents = createSelector(
  [
    selectHorizonItems,
    selectBalances,
    selectCostPaid,
    selectStance,
    selectOn,
    selectDial,
  ],
  (items, balances, costPaid, stance, today, dial): number =>
    items.reduce(
      (sum, { item, version }) =>
        sum +
        sumCountedShortCents(
          getHorizonStatus(
            version.payload,
            balances.assignedByItem[item.id] ?? 0,
            today,
            stance,
            costPaid[item.id],
            balances.costPaidByItem[item.id] ?? 0,
            balances.costFromFreeByItem[item.id] ?? 0,
          ).plan,
          new Set(
            getLiveCosts(version.payload)
              .filter((cost) =>
                isCountedAt(
                  getCostPriority(cost, version.payload.priority),
                  dial,
                ),
              )
              .map(({ id }) => id),
          ),
        ),
      0,
    ),
);
