import type {
  Cents,
  DateOnly,
  OpenCard,
  OpenMove,
  OpenPurchase,
} from '@apps/runway/types';

import { DAY_MS, daysInUtcMonth } from './dates';

/** The day a card is due in one month: its due day, or the month's last day when the month is shorter. */
const dueInMonth = (dueDay: number, year: number, month: number): DateOnly =>
  Date.UTC(year, month, Math.min(dueDay, daysInUtcMonth(year, month)));

/** The next day a card is due, today included; null when it has no due day. */
export function getNextDueOn(
  dueDay: number | null,
  today: DateOnly,
): DateOnly | null {
  if (dueDay === null) return null;
  const now = new Date(today);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const thisMonth = dueInMonth(dueDay, year, month);
  const result =
    thisMonth >= today
      ? thisMonth
      : dueInMonth(dueDay, month === 11 ? year + 1 : year, (month + 1) % 12);
  return result;
}

export interface DueCard {
  card: OpenCard;
  dueOn: DateOnly;
  /** Whole days from today; zero when it is due today. */
  inDays: number;
  waitingCents: Cents;
}

/** The cards with money waiting that are due within `days` of today, soonest first. */
export function getDueCards(
  cards: readonly OpenCard[],
  reserveByCard: Readonly<Record<string, Cents>>,
  today: DateOnly,
  days: number,
): DueCard[] {
  const result = cards
    .flatMap((card): DueCard[] => {
      const dueOn = getNextDueOn(card.dueDay, today);
      const waitingCents = reserveByCard[card.id] ?? 0;
      if (dueOn === null || waitingCents <= 0) return [];
      const inDays = Math.round((dueOn - today) / DAY_MS);
      return inDays <= days ? [{ card, dueOn, inDays, waitingCents }] : [];
    })
    .sort((a, b) => a.dueOn - b.dueOn || b.waitingCents - a.waitingCents);
  return result;
}

export type CardHistoryEntry =
  | {
      kind: 'purchase';
      id: string;
      on: DateOnly;
      cents: Cents;
      purchase: OpenPurchase;
    }
  | { kind: 'bill'; id: string; on: DateOnly; cents: Cents; billId: string }
  | {
      kind: 'payment';
      id: string;
      on: DateOnly;
      cents: Cents;
      /** Taken back by a later move; it no longer counts. */
      isTakenBack: boolean;
    };

/** Everything one card was charged and paid in the moves and purchases given, newest first: purchases, bills paid with it, and payments, taken back or not. */
export function collectCardHistory(
  cardId: string,
  purchases: readonly OpenPurchase[],
  moves: readonly OpenMove[],
): CardHistoryEntry[] {
  const reversed = new Set(
    moves.flatMap((move) => (move.reversesMoveId ? [move.reversesMoveId] : [])),
  );
  const charges = purchases.flatMap((purchase): CardHistoryEntry[] =>
    (purchase.paidByCardId ?? null) === cardId
      ? [
          {
            kind: 'purchase',
            id: purchase.id,
            on: purchase.date,
            cents: purchase.amountCents,
            purchase,
          },
        ]
      : [],
  );
  const fromMoves = moves.flatMap((move): CardHistoryEntry[] => {
    if (move.reversesMoveId) return [];
    if (
      move.kind === 'billPaid' &&
      (move.payload.cardId ?? null) === cardId &&
      move.refId !== null &&
      !reversed.has(move.id)
    ) {
      return [
        {
          kind: 'bill',
          id: move.id,
          on: move.payload.paidOn,
          cents: move.payload.amountCents,
          billId: move.refId,
        },
      ];
    }
    if (move.kind === 'cardPayment' && move.refId === cardId) {
      return [
        {
          kind: 'payment',
          id: move.id,
          on: move.date,
          cents: move.payload.amountCents,
          isTakenBack: reversed.has(move.id),
        },
      ];
    }
    return [];
  });
  const result = [...charges, ...fromMoves].sort(
    (a, b) => b.on - a.on || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  return result;
}
