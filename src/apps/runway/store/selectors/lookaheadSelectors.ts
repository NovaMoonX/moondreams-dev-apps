import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths, startOfUtcDay } from '@apps/runway/engine/dates';
import {
  getStanceCushion,
  lookahead,
  type Lookahead,
  type LookaheadCarry,
} from '@apps/runway/engine/lookahead';
import {
  NO_PROGRESS,
  type BillProgressInput,
} from '@apps/runway/engine/progress';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  computeDraftView,
  selectBillPayments,
  selectBillProgress,
  selectBills,
  selectComingDays,
  selectHeldByItem,
  selectSettledKey,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

type Slice = RootState['runway'];

const selectOn = (_state: RootState, on: number) => on;
const selectItems = (state: RootState) => state.runway.items;
const selectVersions = (state: RootState) => state.runway.versions;
const selectOpenDays = (state: RootState) => state.runway.days;
const selectStartDate = (state: RootState) =>
  state.runway.plan?.startDate ?? null;

/** Each bill's progress with what the walked days of a lookahead gave it added. */
const withCarry = (
  progress: Record<string, BillProgressInput>,
  carry: LookaheadCarry,
) =>
  Object.keys(carry.funded).reduce(
    (acc, id) => ({
      ...acc,
      [id]: {
        paid: (progress[id] ?? NO_PROGRESS).paid,
        funded: [...(progress[id] ?? NO_PROGRESS).funded, ...carry.funded[id]],
      },
    }),
    progress,
  );

const withAdded = (
  held: Record<string, number>,
  added: Record<string, number>,
) =>
  Object.keys(added).reduce(
    (acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + added[id] }),
    held,
  );

interface LookaheadPlanInputs {
  items: Slice['items'];
  versions: Slice['versions'];
  openDays: Slice['days'];
}

/** How far the plan holds on the plan as given: each coming income day drafted after the ones before it. */
export function computeLookahead(
  plan: LookaheadPlanInputs,
  inputs: {
    stance: ReturnType<typeof selectStance>;
    today: number;
    heldByItem: Record<string, number>;
    settledKey: string;
    billProgress: Record<string, BillProgressInput>;
    startDate: number | null;
    /** Where the ledger read since the closing starts; a payment due before it that was not marked paid is not reported late. */
    recentFrom: number | null;
    comingDays: ReturnType<typeof selectComingDays>;
    bills: ReturnType<typeof selectBills>;
    payments: ReturnType<typeof selectBillPayments>;
  },
): Lookahead {
  const { items, versions, openDays } = plan;
  const { stance, today, heldByItem, settledKey, billProgress } = inputs;
  const result = lookahead({
    today,
    horizon: addUtcMonths(today, LOOKAHEAD_MONTHS),
    days: inputs.comingDays,
    bills: inputs.bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      since: Math.max(
        startOfUtcDay(item.createdAt),
        inputs.startDate ?? 0,
        inputs.recentFrom ?? 0,
      ),
    })),
    payments: inputs.payments,
    draftOf: (day, carry) => {
      const view = computeDraftView(
        items,
        versions,
        stance,
        openDays,
        day.dayKey,
        today,
        withAdded(heldByItem, carry.added),
        settledKey,
        withCarry(billProgress, carry),
        { coming: inputs.comingDays, isCached: false },
      );
      return view ? { draft: view.draft, names: view.items } : null;
    },
  });
  return result;
}

/** The lookahead of the plan as it stands. */
export const selectLookahead = createSelector(
  [
    selectItems,
    selectVersions,
    selectOpenDays,
    selectStance,
    selectOn,
    selectHeldByItem,
    selectSettledKey,
    selectBillProgress,
    selectStartDate,
    selectRecentFrom,
    selectComingDays,
    selectBills,
    selectBillPayments,
  ],
  (
    items,
    versions,
    openDays,
    stance,
    today,
    heldByItem,
    settledKey,
    billProgress,
    startDate,
    recentFrom,
    comingDays,
    bills,
    payments,
  ) =>
    computeLookahead(
      { items, versions, openDays },
      {
        stance,
        today,
        heldByItem,
        settledKey,
        billProgress,
        startDate,
        recentFrom,
        comingDays,
        bills,
        payments,
      },
    ),
);

/** What the plan's stance holds back over the next weeks, or null when it holds nothing back. */
export const selectStanceCushion = createSelector(
  [selectStance, selectOn, selectComingDays, selectBillPayments],
  (stance, today, days, payments) =>
    getStanceCushion(stance, today, days, payments),
);

/** Whether any pay or bill in play is a range, so a figure built from them says which end it plans at. */
export const selectRangeSides = createSelector(
  [selectComingDays, selectBillPayments],
  (days, payments) => ({
    income: days.some((day) => day.amount.lowCents !== day.amount.highCents),
    expense: Object.values(payments).some((list) =>
      list.some((payment) => payment.ranged !== null),
    ),
  }),
);
