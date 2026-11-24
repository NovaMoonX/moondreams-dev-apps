// Generated from src/apps/runway/engine/cardNames.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { createOptionMatcher } from '../../../vendor/optionMatchUtils.js';
import type { OpenCard } from '../runwayTypes.js';

export const issuerMatcher = createOptionMatcher({
  typos: true,
  casing: { style: 'title', keepAcronyms: true },
});

export const sameIssuer = (a: string, b: string) =>
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
