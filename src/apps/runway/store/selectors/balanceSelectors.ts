import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectClosingBase } from '@apps/runway/store/selectors/historySelectors';
import {
  withoutSpending,
  type ClosingState,
} from '@apps/runway/engine/closings';
import type { DateOnly, Level } from '@apps/runway/types';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  deriveBalances,
  type BalancesInput,
} from '@apps/runway/engine/balances';

const toBalanceInputs =
  (level: Level) =>
  (
    startDate: DateOnly | null,
    moves: RootState['runway']['moves'],
    records: RootState['runway']['records'],
    days: RootState['runway']['days'],
    items: RootState['runway']['items'],
    purchases: RootState['runway']['purchases'],
    cards: RootState['runway']['cards'],
    closing: ClosingState | null,
    today: DateOnly,
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
    isCountingCards: level === 'track',
    releasedFrom: Object.fromEntries(
      items.flatMap((item) =>
        item.heldReleasedOn === null ? [] : [[item.id, item.heldReleasedOn]],
      ),
    ),
    asOf: today,
    kinds: Object.fromEntries([
      ...items.flatMap((item) =>
        item.kind === 'goal' || item.kind === 'bill' || item.kind === 'envelope'
          ? [[item.id, item.kind] as const]
          : [],
      ),
      ...cards.map((card) => [card.id, 'card'] as const),
    ]),
  });

/** What the balances are summed from, at the level the plan is at. */
export const selectBalanceInputs = createSelector(
  [
    (state: RootState) => state.runway.plan?.startDate ?? null,
    (state: RootState) => state.runway.moves,
    (state: RootState) => state.runway.records,
    (state: RootState) => state.runway.days,
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.purchases,
    (state: RootState) => state.runway.cards,
    selectClosingBase,
    () => todayAsUtcDate(),
    selectLevel,
  ],
  (
    startDate,
    moves,
    records,
    days,
    items,
    purchases,
    cards,
    closing,
    today,
    level,
  ) =>
    toBalanceInputs(level)(
      startDate,
      moves,
      records,
      days,
      items,
      purchases,
      cards,
      closing,
      today,
    ),
);

/** The same sums as tracking counts them, spending and cards included, whatever level the plan is at now: what tracking that starts again carries forward. */
export const selectTrackBalanceInputs = createSelector(
  [
    (state: RootState) => state.runway.plan?.startDate ?? null,
    (state: RootState) => state.runway.moves,
    (state: RootState) => state.runway.records,
    (state: RootState) => state.runway.days,
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.purchases,
    (state: RootState) => state.runway.cards,
    selectClosingBase,
    () => todayAsUtcDate(),
  ],
  toBalanceInputs('track'),
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
