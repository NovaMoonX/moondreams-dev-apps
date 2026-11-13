import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { Cents } from '@apps/runway/types';

/** What each card's bank charges still waiting to settle come to, by card id, counted as the card's reserve counts a charge (its amount, from the start day, once it has lines). */
export const selectPendingByCard = createSelector(
  [
    (state: RootState) => state.runway.purchases,
    (state: RootState) => state.runway.plan?.startDate ?? null,
    selectLevel,
  ],
  (purchases, startDate, level) =>
    startDate === null || !isTrackingLevel(level)
      ? {}
      : purchases
          .filter(
            (purchase) =>
              purchase.status === 'pending' &&
              (purchase.paidByCardId ?? null) !== null &&
              purchase.date >= startDate &&
              purchase.lines.length > 0,
          )
          .reduce<Record<string, Cents>>((sums, purchase) => {
            const cardId = purchase.paidByCardId ?? '';
            sums[cardId] = (sums[cardId] ?? 0) + purchase.amountCents;
            return sums;
          }, {}),
);

/** The part of a card's reserve that is still pending: never below 0 and never more than what is waiting. */
export const getCardPendingCents = (
  pendingByCard: Readonly<Record<string, Cents>>,
  cardId: string,
  reserveCents: Cents,
) =>
  Math.min(Math.max(0, pendingByCard[cardId] ?? 0), Math.max(0, reserveCents));

/** Each card's posted part of what waits to be paid, for totals beside the card rows: the reserve less what is still pending. */
export const toPostedByCard = (
  reserveByCard: Readonly<Record<string, Cents>>,
  pendingByCard: Readonly<Record<string, Cents>>,
) =>
  Object.fromEntries(
    Object.entries(reserveByCard).map(([cardId, reserveCents]) => [
      cardId,
      reserveCents - getCardPendingCents(pendingByCard, cardId, reserveCents),
    ]),
  );
