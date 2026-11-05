import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  computeDraftView,
  selectBillPayments,
  selectBillProgress,
  selectBills,
  selectComingDays,
  selectCostPaid,
  selectDraftHeldByItem,
  selectHorizonItems,
  selectSettledKey,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  getCostPriority,
  sumCountedShortCents,
  sumHorizonAskedCents,
} from '@apps/runway/engine/horizon';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import type { Priority } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

const selectOn = (_state: RootState, on: number) => on;
const selectDial = (_state: RootState, _on: number, dial: Priority) => dial;
const selectItems = (state: RootState) => state.runway.items;
const selectVersions = (state: RootState) => state.runway.versions;
const selectDays = (state: RootState) => state.runway.days;

/** What the income days of the coming month ask for the costs of open Horizon items counted at `dial`, each cost at its own priority. */
export const selectHorizonMonthCents = createSelector(
  [
    selectItems,
    selectVersions,
    selectStance,
    selectDays,
    selectComingDays,
    selectDraftHeldByItem,
    selectSettledKey,
    selectBillProgress,
    selectHorizonItems,
    selectOn,
    selectDial,
  ],
  (
    items,
    versions,
    stance,
    days,
    coming,
    held,
    settledKey,
    progress,
    horizonItems,
    today,
    dial,
  ): number => {
    const until = addUtcMonths(today, 1);
    const openIds = new Set(horizonItems.map(({ item }) => item.id));
    return coming
      .filter(({ on }) => on < until)
      .reduce((sum, { dayKey }) => {
        const view = computeDraftView(
          items,
          versions,
          stance,
          days,
          dayKey,
          today,
          held,
          settledKey,
          progress,
          { coming },
        );
        return (
          sum +
          sumHorizonAskedCents(view?.draft.lines ?? [], openIds, (priority) =>
            isCountedAt(priority, dial),
          )
        );
      }, 0);
  },
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
            version.payload.costs
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
