import { toOrdinal } from '@apps/runway/utils/monthDays';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  CARD_DUE_WARN_DAYS,
  CARD_ISSUERS,
  CARD_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  collectCardHistory,
  getCardDueState,
  getNextDueOn,
  type DueCard,
} from '@apps/runway/engine/cards';
import type {
  CardPaymentCovers,
  CardSealed,
  Cents,
  DateOnly,
  OpenCard,
  OpenMove,
  OpenVersion,
} from '@apps/runway/types';
import { resolveVersion } from '@apps/runway/engine/resolve';
import { createOptionMatcher } from '@/utils/optionMatchUtils';
import type { RootState } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';

const issuerMatcher = createOptionMatcher({
  typos: true,
  casing: { style: 'title', keepAcronyms: true },
});

/** A typed bank as one of the known issuers, or written like them. */
export const resolveIssuer = (typed: string) => {
  const resolution = issuerMatcher.resolve(typed, CARD_ISSUERS);
  return resolution.kind === 'match' ? resolution.option : resolution.label;
};

const sameIssuer = (a: string, b: string) =>
  issuerMatcher.comparable(a) === issuerMatcher.comparable(b);

/** "Capital One Venture X"; "Chase" with no name, and "Chase 2" for a second unnamed card from one issuer, by creation order. */
export function getCardName(card: OpenCard, cards: readonly OpenCard[]) {
  const name = card.name?.trim();
  if (name) return `${card.issuer} ${name}`;
  const unnamed = cards
    .filter(
      (other) => !other.name?.trim() && sameIssuer(other.issuer, card.issuer),
    )
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const position = unnamed.findIndex((other) => other.id === card.id);
  return position > 0 ? `${card.issuer} ${position + 1}` : card.issuer;
}

/** Whether the issuer already has an unnamed card, which the next one from it must be named apart from. */
export const hasUnnamedCardFrom = (
  issuer: string,
  cards: readonly OpenCard[],
  exceptId: string | null,
) =>
  cards.some(
    (card) =>
      card.id !== exceptId &&
      !card.name?.trim() &&
      sameIssuer(card.issuer, issuer),
  );

/** The card a bill is usually charged to on a due date: the version in force then. */
export function getBillCardId(
  versions: readonly OpenVersion[],
  billId: string,
  dueOn: number,
): string | null {
  const version = resolveVersion(
    versions.filter((entry) => entry.kind === 'bill'),
    billId,
    dueOn,
  );
  return version && version.kind === 'bill'
    ? (version.payload.paidByCardId ?? null)
    : null;
}

/** What the card a bill is charged to on a due date is called, or null when it is paid in cash. */
export function getBillCardName(
  versions: readonly OpenVersion[],
  cards: readonly OpenCard[],
  billId: string,
  dueOn: number,
): string | null {
  const cardId = getBillCardId(versions, billId, dueOn);
  const card = cards.find((entry) => entry.id === cardId);
  return card ? getCardName(card, cards) : null;
}

/** Names a card by id for a sentence: the card's name, or "Cash or debit" for none. */
export const getCardNamer =
  (cards: readonly OpenCard[]) => (cardId: string | null) => {
    const found = cards.find((card) => card.id === cardId);
    return found ? getCardName(found, cards) : CARD_WORDS.cashOrDebit;
  };

/** The card a bill payment marked now is charged to: only while tracking, since cards are part of it. */
export function getMarkCardId(
  state: RootState,
  billId: string,
  dueOn: number,
): string | null {
  return selectLevel(state) === 'track'
    ? getBillCardId(state.runway.versions, billId, dueOn)
    : null;
}

/** What warns about one card today (the same answer as Home's), or null; `startDate` is when tracking began. */
export const getCardDueNow = (
  card: OpenCard,
  reserveByCard: Readonly<Record<string, Cents>>,
  moves: readonly OpenMove[],
  today: DateOnly,
  startDate: DateOnly,
): DueCard | null =>
  getCardDueState(
    card,
    reserveByCard[card.id] ?? 0,
    collectCardHistory(card.id, [], moves).flatMap((entry) =>
      entry.kind === 'payment' && !entry.isTakenBack
        ? [{ on: entry.on, covers: entry.covers }]
        : [],
    ),
    today,
    CARD_DUE_WARN_DAYS,
    Math.max(startDate, todayAsUtcDate(card.createdAt)),
  );

/** The one due fact a card shows: "Due Nov 14", "Due in 3 days" / "Due today" inside the warning window when money waits, "Past due since Oct 14", or "Due Nov 3 · not paid by Oct 14"; null with no due day. `due` is what `getCardDueNow` found. */
export function describeCardDue(
  card: OpenCard,
  today: DateOnly,
  due: DueCard | null,
): string | null {
  if (due?.isPastDue) {
    return CARD_WORDS.pastDueSince(formatDateShortUTC(due.dueOn));
  }
  if (due?.rolledFrom) {
    return CARD_WORDS.dueRolled(
      formatDateShortUTC(due.dueOn),
      formatDateShortUTC(due.rolledFrom),
    );
  }
  // Counting down only while the warning is up, so a card already paid for reads as a plain date.
  if (due !== null) {
    return due.inDays === 0
      ? CARD_WORDS.dueToday
      : CARD_WORDS.dueInDays(due.inDays);
  }
  const dueOn = getNextDueOn(card.dueDay, today);
  return dueOn === null ? null : CARD_WORDS.dueOn(formatDateShortUTC(dueOn));
}

/** The cards a list shows: those in use, and an archived one while it still waits to be paid so it can be paid off. */
export const getListedCards = (
  cards: readonly OpenCard[],
  reserveByCard: Readonly<Record<string, Cents>>,
) =>
  cards.filter(
    (card) => card.archivedAt === null || (reserveByCard[card.id] ?? 0) > 0,
  );

/** A card coming due as one sentence: "Chase is due Nov 3 · $120.00 waiting", "is due today", or "was due Oct 14" when past due. */
export const describeDueCard = (name: string, due: DueCard) => {
  const amount = formatCents(due.waitingCents);
  const date = formatDateShortUTC(due.dueOn).replace(/ /g, '\u00a0');
  if (due.isPastDue) return CARD_WORDS.dueWarningPast(name, date, amount);
  return due.inDays === 0
    ? CARD_WORDS.dueTodayWarning(name, amount)
    : CARD_WORDS.dueWarning(name, date, amount);
};

/** "Not paid by Oct 14" for a warning that has moved on to the next due day, else null. */
export const describeDueNote = (due: DueCard) =>
  due.rolledFrom === null
    ? null
    : CARD_WORDS.notPaidBy(formatDateShortUTC(due.rolledFrom));

/** The change-log sentence for a card just added. */
export const describeCardAdded = (name: string, owedCents: Cents) =>
  CARD_WORDS.changeAdded(name, owedCents > 0 ? formatCents(owedCents) : null);

/** The change-log sentence for a card edited: only what differs, from and to; null when nothing does. */
export function describeCardChanged(
  name: string,
  before: CardSealed,
  after: CardSealed,
): string | null {
  const parts = [
    before.issuer === after.issuer
      ? null
      : CARD_WORDS.changeIssuer(before.issuer, after.issuer),
    before.name === after.name
      ? null
      : CARD_WORDS.changeName(
          before.name ?? CARD_WORDS.changeNoName,
          after.name ?? CARD_WORDS.changeNoName,
        ),
    before.dueDay === after.dueDay
      ? null
      : CARD_WORDS.changeDueDay(
          before.dueDay === null
            ? CARD_WORDS.changeNoDueDay
            : CARD_WORDS.dueSummaryDay(before.dueDay, toOrdinal(before.dueDay)),
          after.dueDay === null
            ? CARD_WORDS.changeNoDueDay
            : CARD_WORDS.dueSummaryDay(after.dueDay, toOrdinal(after.dueDay)),
        ),
  ].filter((part) => part !== null);
  return parts.length === 0
    ? null
    : CARD_WORDS.changeChanged(name, parts.join('; '));
}

/** The change-log sentence for a payment made. */
export const describeCardPaid = (
  covers: CardPaymentCovers,
  name: string,
  cents: Cents,
  on: DateOnly,
) => CARD_WORDS.changePaid(covers, name, formatCents(cents), formatDateUTC(on));

/** The change-log sentence for a payment taken back. */
export const describeCardTakenBack = (
  name: string,
  cents: Cents,
  on: DateOnly,
) => CARD_WORDS.changeTakenBack(name, formatCents(cents), formatDateUTC(on));
