import { CARD_ISSUERS } from '@apps/runway/constants';
import type { OpenCard, OpenVersion } from '@apps/runway/types';
import { resolveVersion } from '@apps/runway/engine/resolve';
import { createOptionMatcher } from '@/utils/optionMatchUtils';

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
