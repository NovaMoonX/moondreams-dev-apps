import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectClosingBase } from '@apps/runway/store/selectors/historySelectors';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { deriveBalances } from '@apps/runway/engine/balances';
import {
  getBankBacking,
  readCashPosition,
  toBalanceInputs,
  toBankedBalanceInputs,
  toLedgerBalanceInputs,
} from '@apps/runway/engine/figures';
import { selectTwinnedEmailIds } from '@apps/runway/store/selectors/emailSelectors';
import { selectBankHeldByCard } from '@apps/runway/store/selectors/cardBankSelectors';

/** What the ledger sums from, at the level the plan is at, before any match to the account balances; at Link a linked card takes its bank's figure. */
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
    selectBankHeldByCard,
  ],
  toLedgerBalanceInputs,
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
    selectTwinnedEmailIds,
    () => todayAsUtcDate(),
  ],
  readCashPosition,
);

/** At Link, whether Free to Spend comes from the account balances, and what they hold beyond (or short of) what the ledger counts. Typed balances stand in for accounts with no link; nothing changes while an account that counts has no balance at all. */
export const selectBankBacking = createSelector(
  [selectLevel, selectLedgerBalances, selectCashPosition],
  getBankBacking,
);

/** What the balances are summed from, at the level the plan is at, matched to the account balances at Link. */
export const selectBalanceInputs = createSelector(
  [selectLedgerBalanceInputs, selectBankBacking],
  toBankedBalanceInputs,
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

/** Every balance summed from the ledger alone, before Free to Spend covers any bill; the screens read the covered figures (`billCoverSelectors`). */
export const selectLedgerOnlyBalances = createSelector(
  [selectBalanceInputs],
  deriveBalances,
);
