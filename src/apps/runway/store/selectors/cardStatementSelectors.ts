import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getBankDueDay } from '@apps/runway/engine/cards';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard, OpenCardStatement } from '@apps/runway/types';

/** A card's statement, only while the card is linked and its link still works: a broken link's last statement goes stale with nothing to correct it. */
export const getLinkedStatement = (
  runway: Pick<RootState['runway'], 'cardStatements' | 'links'>,
  card: Pick<OpenCard, 'id' | 'linkId'>,
): OpenCardStatement | null => {
  const isWorking = runway.links.some(
    (link) => link.id === card.linkId && link.status === 'active',
  );
  if (card.linkId === null || !isWorking) return null;
  return runway.cardStatements.find((entry) => entry.id === card.id) ?? null;
};

/** Every card with the bank's due day in place of the typed one while it is linked and the bank names one; never written back, so unlinking brings the typed day back. For reading due dates only: a form that saves a card reads it from `selectAllCards`. */
export const selectCardsWithBankDue = createSelector(
  [
    selectAllCards,
    (state: RootState) => state.runway.cardStatements,
    (state: RootState) => state.runway.links,
  ],
  (cards, cardStatements, links) =>
    cards.map((card) => {
      const day = getBankDueDay(
        getLinkedStatement({ cardStatements, links }, card),
      );
      return day === null ? card : { ...card, dueDay: day };
    }),
);
