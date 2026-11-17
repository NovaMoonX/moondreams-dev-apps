import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getBankOwedByCard, type BankOwed } from '@apps/runway/engine/cards';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { Cents } from '@apps/runway/types';

/** At Link, each linked card with a balance from its bank, read from the bank (`getBankOwedByCard`); empty at every other level, where a card's figure is what Runway counted. */
export const selectBankOwedByCard = createSelector(
  [
    selectLevel,
    (state: RootState) => state.runway.cards,
    (state: RootState) => state.runway.accountBalances,
    (state: RootState) => state.runway.purchases,
    (state: RootState) => state.runway.needsHome,
    (state: RootState) => state.runway.startedPayments,
  ],
  (
    level,
    cards,
    accountBalances,
    purchases,
    needsHome,
    started,
  ): Record<string, BankOwed> => {
    if (level !== 'link') return {};
    const bankById = new Map(accountBalances.map((entry) => [entry.id, entry]));
    const linked = cards.flatMap((card) => {
      const bank = card.linkId === null ? undefined : bankById.get(card.id);
      return bank === undefined
        ? []
        : [{ id: card.id, postedCents: bank.cents }];
    });
    if (linked.length === 0) return {};
    return getBankOwedByCard({
      cards: linked,
      purchases: [
        ...new Map(
          [...needsHome, ...purchases].map((purchase) => [
            purchase.id,
            purchase,
          ]),
        ).values(),
      ],
      started,
    });
  },
);

/** What each linked card holds back from Free to Spend at Link, by card id. */
export const selectBankHeldByCard = createSelector(
  [selectBankOwedByCard],
  (owed): Record<string, Cents> =>
    Object.fromEntries(
      Object.entries(owed).map(([id, entry]) => [id, entry.heldCents]),
    ),
);
