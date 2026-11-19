import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectLedgerOnlyBalances as selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectUsualMonthPlan } from '@apps/runway/store/selectors/usualMonthSelectors';
import {
  getEventGoalCover,
  selectAllHorizonItems,
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
import { getGoalCostId, type GoalCover } from '@apps/runway/engine/horizonGoal';
import { isSavingFor } from '@apps/runway/engine/pace';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import type { Priority } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

const selectOn = (_state: RootState, on: number) => on;
const selectDial = (_state: RootState, _on: number, dial: Priority) => dial;

/** What the goal each open event draws from holds now and puts in on the coming income days, by event id; an event with no live goal has none. */
export const selectGoalCovers = createSelector(
  [
    selectAllHorizonItems,
    selectBalances,
    selectComingDays,
    selectStance,
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.versions,
    selectOn,
  ],
  (
    events,
    balances,
    comingDays,
    stance,
    items,
    versions,
    today,
  ): Record<string, GoalCover> =>
    Object.fromEntries(
      events.flatMap(({ item, version }) => {
        const cover = getEventGoalCover(
          version.payload,
          items,
          versions,
          today,
          comingDays,
          balances.assignedByItem,
          stance,
        );
        return cover === null ? [] : [[item.id, cover]];
      }),
    ),
);

/** The dated goals counted at `dial` whose pace already covers their event's goal cost, so the month total leaves that cost out; a goal funded by whatever is left, or with no date, has no such pace. */
const selectPacedGoalIds = createSelector(
  [
    (state: RootState, on: number) => selectUsualMonthPlan(state, on).goals,
    selectDial,
  ],
  (goals, dial) =>
    new Set(
      goals
        .filter(
          ({ version: { payload } }) =>
            isSavingFor(payload) &&
            payload.targetDate !== null &&
            payload.funding.amount.kind !== 'rest' &&
            isCountedAt(payload.priority, dial),
        )
        .map(({ item }) => item.id),
    ),
);

/** The steady amount a month the costs of open Horizon items counted at `dial` need, each cost at its own priority, to meet every payment on its due date from what is not yet held; the usual-month basis the dated goals use. */
export const selectHorizonMonthCents = createSelector(
  [
    selectHorizonItems,
    selectBalances,
    selectCostPaid,
    selectStance,
    selectOn,
    selectDial,
    selectGoalCovers,
    selectPacedGoalIds,
  ],
  (
    items,
    balances,
    costPaid,
    stance,
    today,
    dial,
    covers,
    pacedGoalIds,
  ): number =>
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
            covers[item.id] ?? null,
          ).plan.covers,
          new Set(
            getLiveCosts(version.payload)
              .filter(
                (cost) =>
                  isCountedAt(
                    getCostPriority(cost, version.payload.priority),
                    dial,
                  ) &&
                  !(
                    version.payload.goalId !== null &&
                    cost.id === getGoalCostId(version.payload.goalId) &&
                    pacedGoalIds.has(version.payload.goalId)
                  ),
              )
              .map(({ id }) => id),
          ),
          today,
          version.payload.rest.kind === 'pays'
            ? version.payload.rest.startsOn
            : null,
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
      .filter(({ paid, payOn }) => paid === null && payOn < nextPay.on)
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
    selectGoalCovers,
  ],
  (items, balances, costPaid, stance, today, dial, covers): number =>
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
            covers[item.id] ?? null,
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
