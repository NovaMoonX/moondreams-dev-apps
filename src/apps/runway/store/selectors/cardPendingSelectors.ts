import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { Cents } from '@apps/runway/types';

/** What each card's bank charges still waiting to settle come to, by card id: the same counted lines the card's reserve is built from. */
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
              purchase.date >= startDate,
          )
          .reduce<Record<string, Cents>>((sums, purchase) => {
            const cardId = purchase.paidByCardId ?? '';
            sums[cardId] =
              (sums[cardId] ?? 0) +
              purchase.lines.reduce((sum, line) => sum + line.cents, 0);
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
