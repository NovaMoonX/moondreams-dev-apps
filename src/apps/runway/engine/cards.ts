import type {
  CardPaymentCovers,
  Cents,
  DateOnly,
  OpenCard,
  OpenMove,
  OpenPurchase,
} from '@apps/runway/types';

import { DAY_MS, daysInUtcMonth, todayAsUtcDate } from './dates';

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

/** The latest day a card is due on or before `date`; null when it has no due day. */
export function getPrevDueOn(
  dueDay: number | null,
  date: DateOnly,
): DateOnly | null {
  if (dueDay === null) return null;
  const now = new Date(date);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const thisMonth = dueInMonth(dueDay, year, month);
  const result =
    thisMonth <= date
      ? thisMonth
      : dueInMonth(dueDay, month === 0 ? year - 1 : year, (month + 11) % 12);
  return result;
}

export interface DueCard {
  card: OpenCard;
  dueOn: DateOnly;
  /** Whole days from today; zero when it is due today, below zero when it is past due. */
  inDays: number;
  isPastDue: boolean;
  /** An earlier due day left unpaid, when the warning has moved on to the next one. */
  rolledFrom: DateOnly | null;
  waitingCents: Cents;
}

interface CoveringPayment {
  on: DateOnly;
  covers: CardPaymentCovers;
}

/**
 * Whether a card needs a warning today: due within `days` and not yet paid for that due day, or past
 * due and still unpaid until the next due day is within `days`. A due day is paid for by a payment in
 * full or of the minimum made after the due day before it; a part payment leaves it up. Due days
 * before `since` (the card added, or tracking started) never warn.
 */
export function getCardDueState(
  card: OpenCard,
  waitingCents: Cents,
  payments: readonly CoveringPayment[],
  today: DateOnly,
  days: number,
  since: DateOnly,
): DueCard | null {
  const next = getNextDueOn(card.dueDay, today);
  if (next === null || waitingCents <= 0) return null;
  // Only the last due day and the next one are open; each covering payment pays for one, earliest first.
  const prev = getPrevDueOn(card.dueDay, today - DAY_MS);
  const dueDays = [...(prev !== null && prev >= since ? [prev] : []), next];
  const covering = [...payments]
    .filter((payment) => payment.covers !== 'part')
    .sort((a, b) => a.on - b.on);
  // A payment in full pays for every open due day it came after; the minimum pays for one, earliest first.
  const paidFor = covering.reduce<Set<DateOnly>>((paid, payment) => {
    const open = dueDays.filter(
      (dueOn) =>
        !paid.has(dueOn) &&
        payment.on > (getPrevDueOn(card.dueDay, dueOn - DAY_MS) ?? 0),
    );
    const settled = payment.covers === 'full' ? open : open.slice(0, 1);
    return new Set([...paid, ...settled]);
  }, new Set<DateOnly>());
  const isPaidFor = (dueOn: DateOnly) => paidFor.has(dueOn);
  const unpaidPrev =
    prev !== null && prev >= since && !isPaidFor(prev) ? prev : null;
  const inDays = Math.round((next - today) / DAY_MS);
  if (inDays <= days) {
    return isPaidFor(next)
      ? null
      : {
          card,
          dueOn: next,
          inDays,
          isPastDue: false,
          rolledFrom: unpaidPrev,
          waitingCents,
        };
  }
  if (unpaidPrev === null) return null;
  return {
    card,
    dueOn: unpaidPrev,
    inDays: Math.round((unpaidPrev - today) / DAY_MS),
    isPastDue: true,
    rolledFrom: null,
    waitingCents,
  };
}

/** Every card that needs a warning today, soonest due first. */
export function getDueCards(
  cards: readonly OpenCard[],
  reserveByCard: Readonly<Record<string, Cents>>,
  moves: readonly OpenMove[],
  today: DateOnly,
  days: number,
  startDate: DateOnly,
): DueCard[] {
  const result = cards
    .flatMap((card) => {
      const payments = collectCardHistory(card.id, [], moves).flatMap(
        (entry): CoveringPayment[] =>
          entry.kind === 'payment' && !entry.isTakenBack
            ? [{ on: entry.on, covers: entry.covers }]
            : [],
      );
      const state = getCardDueState(
        card,
        reserveByCard[card.id] ?? 0,
        payments,
        today,
        days,
        Math.max(startDate, todayAsUtcDate(card.createdAt)),
      );
      return state === null ? [] : [state];
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
      covers: CardPaymentCovers;
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
          covers: move.payload.covers ?? 'full',
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

/** A card's history with what it owed after each entry, worked back from what it owes now, so the figures stay right when older entries are not listed. Newest first, as given. */
export function withOwedAfter(
  entries: readonly CardHistoryEntry[],
  owedNowCents: Cents,
): (CardHistoryEntry & { owedAfterCents: Cents })[] {
  const effect = (entry: CardHistoryEntry) => {
    if (entry.kind !== 'payment') return entry.cents;
    return entry.isTakenBack ? 0 : -entry.cents;
  };
  const result = entries.reduce<
    (CardHistoryEntry & { owedAfterCents: Cents })[]
  >((rows, entry) => {
    const newer = rows.at(-1);
    const owedAfterCents =
      newer === undefined
        ? owedNowCents
        : newer.owedAfterCents - effect(entries[rows.length - 1]);
    return [...rows, { ...entry, owedAfterCents }];
  }, []);
  return result;
}
