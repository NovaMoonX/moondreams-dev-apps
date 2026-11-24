import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getBankHeldByCard, getBankOwed } from '@apps/runway/engine/figures';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectTwinnedEmailIds } from '@apps/runway/store/selectors/emailSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';

/** At Link, each linked card with a balance from its bank, read from the bank (`getBankOwedByCard`); empty at every other level, where a card's figure is what Runway counted. */
export const selectBankOwedByCard = createSelector(
  [
    selectLevel,
    (state: RootState) => state.runway.cards,
    (state: RootState) => state.runway.accountBalances,
    (state: RootState) => state.runway.purchases,
    (state: RootState) => state.runway.needsHome,
    (state: RootState) => state.runway.startedPayments,
    selectTwinnedEmailIds,
    () => todayAsUtcDate(),
  ],
  getBankOwed,
);

/** What each linked card holds back from Free to Spend at Link, by card id. */
export const selectBankHeldByCard = createSelector(
  [selectBankOwedByCard],
  getBankHeldByCard,
);
