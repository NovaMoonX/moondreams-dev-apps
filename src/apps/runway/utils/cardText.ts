import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  CARD_DUE_WARN_DAYS,
  CARD_ISSUERS,
  CARD_WORDS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import { getNextDueOn } from '@apps/runway/engine/cards';
import type {
  Cents,
  DateOnly,
  OpenCard,
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

/** The one due fact a card shows: "Due Nov 14", or "Due in 3 days" / "Due today" inside the warning window when money waits; null with no due day. */
export function describeCardDue(
  card: OpenCard,
  waitingCents: Cents,
  today: DateOnly,
): string | null {
  const dueOn = getNextDueOn(card.dueDay, today);
  if (dueOn === null) return null;
  const inDays = Math.round((dueOn - today) / DAY_MS);
  if (waitingCents <= 0 || inDays > CARD_DUE_WARN_DAYS) {
    return CARD_WORDS.dueOn(formatDateShortUTC(dueOn));
  }
  return inDays === 0 ? CARD_WORDS.dueToday : CARD_WORDS.dueInDays(inDays);
}

/** The cards a list shows: those in use, and an archived one while it still waits to be paid so it can be paid off. */
export const getListedCards = (
  cards: readonly OpenCard[],
  reserveByCard: Readonly<Record<string, Cents>>,
) =>
  cards.filter(
    (card) => card.archivedAt === null || (reserveByCard[card.id] ?? 0) > 0,
  );

/** A card coming due as one sentence: "Chase is due Nov 3 · $120.00 waiting", or "is due today". */
export const describeDueCard = (
  name: string,
  dueOn: DateOnly,
  inDays: number,
  waitingCents: Cents,
) => {
  const amount = formatCents(waitingCents);
  return inDays === 0
    ? CARD_WORDS.dueTodayWarning(name, amount)
    : CARD_WORDS.dueWarning(
        name,
        formatDateShortUTC(dueOn).replace(/ /g, ' '),
        amount,
      );
};
