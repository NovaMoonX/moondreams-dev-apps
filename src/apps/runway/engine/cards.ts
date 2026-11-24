import type {
  CardPaymentCovers,
  Cents,
  DateOnly,
  OpenCard,
  OpenCardStatement,
  OpenMove,
  OpenPurchase,
  OpenStartedPayment,
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

/** Whether the bank shows a payment of at least `minimumCents` since the statement was made. */
export const isMinimumPaid = (
  statement: OpenCardStatement,
  minimumCents: Cents,
) =>
  statement.statementOn !== null &&
  statement.lastPaymentOn !== null &&
  statement.lastPaymentCents !== null &&
  statement.lastPaymentOn >= statement.statementOn &&
  statement.lastPaymentCents >= minimumCents;

/** The minimum the bank asks for by `forDueOn`, or null when it asks for none: no statement, a statement for another due day, no minimum above zero, or a payment the bank already shows since the statement that covers it. */
export function getMinimumDue(
  statement: OpenCardStatement | null | undefined,
  forDueOn: DateOnly | null,
): Cents | null {
  if (!statement || forDueOn === null) return null;
  const { minimumCents, dueOn } = statement;
  if (minimumCents === null || minimumCents <= 0 || dueOn !== forDueOn)
    return null;
  return isMinimumPaid(statement, minimumCents) ? null : minimumCents;
}

export type StatementMinimum =
  | { kind: 'due'; cents: Cents; dueOn: DateOnly | null }
  | { kind: 'paid'; cents: Cents; paidCents: Cents; paidOn: DateOnly }
  | { kind: 'none' }
  | { kind: 'notShared' };

/** What the bank's latest statement says about its minimum, whatever due day the app is on: owed, already paid since the statement, nothing (a $0 minimum) or not shared. */
export function getStatementMinimum(
  statement: OpenCardStatement,
): StatementMinimum {
  const { minimumCents, dueOn, lastPaymentCents, lastPaymentOn } = statement;
  if (minimumCents === null) return { kind: 'notShared' };
  if (minimumCents <= 0) return { kind: 'none' };
  if (
    isMinimumPaid(statement, minimumCents) &&
    lastPaymentCents !== null &&
    lastPaymentOn !== null
  ) {
    return {
      kind: 'paid',
      cents: minimumCents,
      paidCents: lastPaymentCents,
      paidOn: lastPaymentOn,
    };
  }
  return { kind: 'due', cents: minimumCents, dueOn };
}

/** The day of the month the bank's due date falls on, or null when it names none. */
export function getBankDueDay(
  statement: OpenCardStatement | null | undefined,
): number | null {
  const dueOn = statement?.dueOn ?? null;
  return dueOn === null ? null : new Date(dueOn).getUTCDate();
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

/** Every card that needs a warning today, soonest due first; a card in `bankDue` (read from its bank at Link) takes that answer instead. */
export function getDueCards(
  cards: readonly OpenCard[],
  reserveByCard: Readonly<Record<string, Cents>>,
  moves: readonly OpenMove[],
  today: DateOnly,
  days: number,
  startDate: DateOnly,
  bankDue: Readonly<Record<string, DueCard | null>> = {},
): DueCard[] {
  const result = cards
    .flatMap((card) => {
      if (Object.hasOwn(bankDue, card.id)) {
        const due = bankDue[card.id];
        return due ? [{ ...due, card }] : [];
      }
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
    (purchase.paidByCardId ?? null) === cardId &&
    purchase.pairedWithId === null &&
    (purchase.billRef ?? null) === null
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

const USUAL_CARD_LOOKBACK = 20;

/** What the person usually pays with for an envelope: the most used of their last purchases from it, a card id or null for cash; undefined when there is no purchase to go by or the usual card is gone. Ties go to the most recent. */
export function getUsualCardId(
  envelopeId: string,
  purchases: readonly OpenPurchase[],
  cardIds: readonly string[],
): string | null | undefined {
  const recent = purchases
    .filter(
      (purchase) =>
        purchase.amountCents > 0 &&
        purchase.lines.some((line) => line.envelopeId === envelopeId),
    )
    .sort((a, b) => b.date - a.date)
    .slice(0, USUAL_CARD_LOOKBACK)
    .map((purchase) => purchase.paidByCardId ?? null);
  const counts = recent.reduce<Map<string | null, number>>(
    (acc, id) => new Map(acc).set(id, (acc.get(id) ?? 0) + 1),
    new Map(),
  );
  const usual = recent.reduce<string | null | undefined>(
    (best, id) =>
      best === undefined || (counts.get(id) ?? 0) > (counts.get(best) ?? 0)
        ? id
        : best,
    undefined,
  );
  if (usual === undefined || usual === null) return usual;
  return cardIds.includes(usual) ? usual : undefined;
}

/** How far before a started payment's day the bank may date either side of it. */
const STARTED_PAYMENT_LEAD_DAYS = 3;
/** How long after a started payment's day either side of it may still turn up; after that it is no longer waited for. */
export const STARTED_PAYMENT_WINDOW_DAYS = 14;
const CARD_PAYMENT_CATEGORY = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';

/** Whether a started payment is still waited for on `today`: within its window after the day it was started. */
export const isStillWaitedFor = (
  payment: OpenStartedPayment,
  today: DateOnly,
) =>
  today <= payment.startedOn + STARTED_PAYMENT_WINDOW_DAYS * DAY_MS;

export interface StartedPaymentState {
  payment: OpenStartedPayment;
  /** The money has left one of the person's accounts, so their cash already counts it gone. */
  hasLeft: boolean;
}

export interface BankOwed {
  /** The bank's posted balance: what it says the card owes now, pending charges left out. */
  postedCents: Cents;
  /** Charges, less refunds and payments, the bank lists on the card and hasn't posted yet. */
  pendingCents: Cents;
  /** Payments started that the card doesn't show yet, oldest first. */
  waiting: StartedPaymentState[];
  /** What the card holds back from Free to Spend: posted and pending, less a waiting payment once it has left an account. */
  heldCents: Cents;
}

type BankPurchase = Pick<
  OpenPurchase,
  'id' | 'date' | 'source' | 'status' | 'amountCents' | 'accountId'
> & {
  paidByCardId?: string | null;
  category?: string | null;
  emailWaiting?: boolean | null;
};

/** Each linked card's figure from its bank: the posted balance, the pending charges on it, and the payments the person started that the card hasn't shown yet. A started payment is matched one to one by amount, within its window, to the card's own credit (it has landed) or to money out of an account (it has left); one bank transaction settles one payment across every card, a card payment by the bank's category before any other. A payment not seen within 14 days of its day is no longer waited for. */
export function getBankOwedByCard(input: {
  cards: readonly { id: string; postedCents: Cents }[];
  purchases: readonly BankPurchase[];
  started: readonly OpenStartedPayment[];
  today: DateOnly;
  /** Emailed purchases whose bank charge is already here (`findEmailTwins`): the charge counts, so the emailed one does not. */
  twinnedEmailIds?: ReadonlySet<string>;
}): Record<string, BankOwed> {
  const twinned = input.twinnedEmailIds ?? new Set<string>();
  const fromBank = input.purchases.filter(
    (purchase) => purchase.source === 'link',
  );
  const onCard = (cardId: string) =>
    fromBank.filter((purchase) => (purchase.paidByCardId ?? null) === cardId);
  const outOfAccounts = fromBank.filter(
    (purchase) =>
      purchase.accountId !== null && (purchase.paidByCardId ?? null) === null,
  );
  const cardIds = new Set(input.cards.map((card) => card.id));
  const ordered = input.started
    .filter(
      (payment) =>
        cardIds.has(payment.cardId) && isStillWaitedFor(payment, input.today),
    )
    .sort(
      (a, b) =>
        a.startedOn - b.startedOn ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
  const takeMatch = (
    used: ReadonlySet<string>,
    side: readonly BankPurchase[],
    payment: OpenStartedPayment,
    cents: Cents,
  ) =>
    side
      .filter(
        (purchase) =>
          !used.has(purchase.id) &&
          purchase.amountCents === cents &&
          purchase.date >=
            payment.startedOn - STARTED_PAYMENT_LEAD_DAYS * DAY_MS &&
          purchase.date <=
            payment.startedOn + STARTED_PAYMENT_WINDOW_DAYS * DAY_MS,
      )
      .sort(
        (a, b) =>
          Number(b.category === CARD_PAYMENT_CATEGORY) -
            Number(a.category === CARD_PAYMENT_CATEGORY) ||
          a.date - b.date ||
          a.id.localeCompare(b.id),
      )[0] ?? null;
  const { waiting } = ordered.reduce<{
    used: ReadonlySet<string>;
    waiting: StartedPaymentState[];
  }>(
    (acc, payment) => {
      const landed = takeMatch(
        acc.used,
        onCard(payment.cardId),
        payment,
        -payment.amountCents,
      );
      if (landed !== null) {
        return { ...acc, used: new Set([...acc.used, landed.id]) };
      }
      const left = takeMatch(
        acc.used,
        outOfAccounts,
        payment,
        payment.amountCents,
      );
      return {
        used: left === null ? acc.used : new Set([...acc.used, left.id]),
        waiting: [...acc.waiting, { payment, hasLeft: left !== null }],
      };
    },
    { used: new Set<string>(), waiting: [] },
  );
  return Object.fromEntries(
    input.cards.map((card) => {
      const pendingCents =
        onCard(card.id)
          .filter((purchase) => purchase.status === 'pending')
          .reduce((sum, purchase) => sum + purchase.amountCents, 0) +
        input.purchases
          .filter(
            (purchase) =>
              purchase.source === 'email' &&
              purchase.emailWaiting === true &&
              purchase.amountCents > 0 &&
              (purchase.paidByCardId ?? null) === card.id &&
              !twinned.has(purchase.id),
          )
          .reduce((sum, purchase) => sum + purchase.amountCents, 0);
      const mine = waiting.filter((entry) => entry.payment.cardId === card.id);
      const leftCents = mine
        .filter((entry) => entry.hasLeft)
        .reduce((sum, entry) => sum + entry.payment.amountCents, 0);
      return [
        card.id,
        {
          postedCents: card.postedCents,
          pendingCents,
          waiting: mine,
          heldCents: card.postedCents + pendingCents - leftCents,
        },
      ];
    }),
  );
}

/**
 * At Link, a card read from its bank warns only for a minimum that is unpaid: the statement's minimum is above zero,
 * its due day is within `days` or past, and neither the bank's last payment since the statement nor a payment the
 * person started since it covers the minimum. A card whose bank doesn't share the minimum never warns. A due day
 * before `since` never warns.
 */
export function getBankDueState(input: {
  card: OpenCard;
  statement: OpenCardStatement | null;
  started: readonly OpenStartedPayment[];
  owedCents: Cents;
  today: DateOnly;
  days: number;
  since: DateOnly;
}): DueCard | null {
  const { statement } = input;
  if (statement === null || input.owedCents <= 0) return null;
  const { minimumCents, dueOn, statementOn } = statement;
  if (minimumCents === null || minimumCents <= 0 || dueOn === null) return null;
  if (dueOn < input.since || isMinimumPaid(statement, minimumCents))
    return null;
  const isStartedCovering = input.started.some(
    (payment) =>
      payment.cardId === input.card.id &&
      isStillWaitedFor(payment, input.today) &&
      payment.amountCents >= minimumCents &&
      (statementOn === null || payment.startedOn >= statementOn),
  );
  if (isStartedCovering) return null;
  const inDays = Math.round((dueOn - input.today) / DAY_MS);
  if (inDays > input.days) return null;
  return {
    card: input.card,
    dueOn,
    inDays,
    isPastDue: inDays < 0,
    rolledFrom: null,
    waitingCents: input.owedCents,
  };
}
