import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { CARD_DUE_WARN_DAYS } from '@apps/runway/constants';
import {
  getBankDueDay,
  getBankDueState,
  isStillWaitedFor,
  type BankOwed,
  type DueCard,
} from '@apps/runway/engine/cards';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectBankOwedByCard } from '@apps/runway/store/selectors/cardBankSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type {
  DateOnly,
  OpenCard,
  OpenCardStatement,
  OpenStartedPayment,
} from '@apps/runway/types';

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

/** At Link, each card read from its bank and what warns about it from `today` up to `days` ahead, from the bank's minimum alone (`getBankDueState`); a card here never warns from Runway's own record of payments. A payment the person started counts only while it is still waited for on `waitedOn`. */
export const getBankDueByCard = (input: {
  owed: Readonly<Record<string, BankOwed>>;
  cards: readonly OpenCard[];
  runway: Pick<RootState['runway'], 'cardStatements' | 'links'>;
  started: readonly OpenStartedPayment[];
  startDate: DateOnly;
  today: DateOnly;
  days: number;
  waitedOn: DateOnly;
}): Record<string, DueCard | null> => {
  const started = input.started.filter((payment) =>
    isStillWaitedFor(payment, input.waitedOn),
  );
  return Object.fromEntries(
    input.cards.flatMap((card) => {
      const entry = input.owed[card.id];
      if (entry === undefined) return [];
      return [
        [
          card.id,
          getBankDueState({
            card,
            statement: getLinkedStatement(input.runway, card),
            started,
            owedCents: entry.heldCents,
            today: input.today,
            days: input.days,
            since: Math.max(input.startDate, todayAsUtcDate(card.createdAt)),
          }),
        ],
      ];
    }),
  );
};

/** At Link, each card read from its bank and what warns about it today. */
export const selectBankDueByCard = createSelector(
  [
    selectBankOwedByCard,
    (state: RootState) => state.runway.cards,
    (state: RootState) => state.runway.cardStatements,
    (state: RootState) => state.runway.links,
    (state: RootState) => state.runway.startedPayments,
    (state: RootState) => state.runway.plan?.startDate ?? 0,
    () => todayAsUtcDate(),
  ],
  (
    owed,
    cards,
    cardStatements,
    links,
    started,
    startDate,
    today,
  ): Record<string, DueCard | null> =>
    getBankDueByCard({
      owed,
      cards,
      runway: { cardStatements, links },
      started,
      startDate,
      today,
      days: CARD_DUE_WARN_DAYS,
      waitedOn: today,
    }),
);
