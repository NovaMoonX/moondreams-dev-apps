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
import { isTrackingLevel } from '@apps/runway/engine/level';
import { getCashPosition } from '@apps/runway/engine/cash';

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
    purchases: isTrackingLevel(level) ? purchases : [],
    closing:
      closing !== null && !isTrackingLevel(level)
        ? withoutSpending(closing)
        : closing,
    isCountingCards: isTrackingLevel(level),
    releasedFrom: Object.fromEntries(
      items.flatMap((item) =>
        item.heldReleasedOn === null ? [] : [[item.id, item.heldReleasedOn]],
      ),
    ),
    asOf: today,
    kinds: Object.fromEntries([
      ...items.flatMap((item) =>
        item.kind === 'goal' ||
        item.kind === 'bill' ||
        item.kind === 'envelope' ||
        item.kind === 'horizon'
          ? [[item.id, item.kind] as const]
          : [],
      ),
      ...cards.map((card) => [card.id, 'card'] as const),
    ]),
  });

/** What the ledger alone sums from, at the level the plan is at, before any match to the account balances. */
export const selectLedgerBalanceInputs = createSelector(
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

/** The balances from the ledger alone: what a check against the bank compares with. */
export const selectLedgerBalances = createSelector(
  [selectLedgerBalanceInputs],
  deriveBalances,
);

/** Where the cash in the accounts that count goes, at Link. Raw lists are read here: the account selectors live in a file that imports this one. */
export const selectCashPosition = createSelector(
  [
    selectLedgerBalances,
    (state: RootState) => state.runway.accounts,
    (state: RootState) => state.runway.accountBalances,
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.needsHome,
    (state: RootState) => state.runway.purchases,
    () => todayAsUtcDate(),
  ],
  (balances, accounts, accountBalances, items, needsHome, purchases, today) =>
    getCashPosition({
      accounts: [...accounts].sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      ),
      bankBalances: Object.fromEntries(
        accountBalances.map((entry) => [entry.id, entry.cents]),
      ),
      balances,
      goalIds: items
        .filter(
          (item) =>
            item.kind === 'goal' &&
            !(item.heldReleasedOn !== null && item.heldReleasedOn <= today),
        )
        .map((item) => item.id),
      envelopeIds: items
        .filter((item) => item.kind === 'envelope')
        .map((item) => item.id),
      purchases: [
        ...new Map(
          [...needsHome, ...purchases].map((purchase) => [
            purchase.id,
            purchase,
          ]),
        ).values(),
      ],
    }),
);

/** At Link, whether Free to Spend comes from the account balances, and what they hold beyond (or short of) what the ledger counts. Typed balances stand in for accounts with no link; nothing changes while an account that counts has no balance at all. */
export const selectBankBacking = createSelector(
  [selectLevel, selectLedgerBalances, selectCashPosition],
  (level, ledger, position) => {
    const isBacked =
      level === 'link' &&
      ledger.hasMoney &&
      position.cashCents !== null &&
      position.accounts.some((account) => account.isBank);
    return {
      isBacked,
      hasTyped: position.accounts.some((account) => !account.isBank),
      cents: isBacked
        ? (position.freeCents ?? 0) -
          position.overAssignedCents -
          ledger.freeToSpendCents
        : 0,
    };
  },
);

/** What the balances are summed from, at the level the plan is at, matched to the account balances at Link. */
export const selectBalanceInputs = createSelector(
  [selectLedgerBalanceInputs, selectBankBacking],
  (inputs, backing): BalancesInput => ({
    ...inputs,
    bankAdjustCents: backing.cents,
  }),
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

/** What a place holds now; null is Free to Spend. */
export const selectHeldBy = (state: RootState, placeId: string | null) =>
  placeId === null
    ? selectFreeToSpend(state)
    : selectEnvelopeFigure(state, placeId);

