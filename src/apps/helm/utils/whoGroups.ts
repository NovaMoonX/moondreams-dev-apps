import type { OpenWho } from '@apps/helm/types';

export interface WhoGroups {
  close: OpenWho[];
  regular: OpenWho[];
  others: OpenWho[];
}

const byName = (a: OpenWho, b: OpenWho) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const matches = (who: OpenWho, needle: string) =>
  [who.name, ...who.aliases, who.relation ?? '', who.species ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);

/** People by tier, A to Z in each, the person themself first in Close; a search keeps the ones whose name, alias, relation or species holds the words. Ones that would not open sit last in Others. */
export function groupWho(who: OpenWho[], search: string): WhoGroups {
  const needle = search.trim().toLowerCase();
  const kept = who.filter(
    (entry) => !needle || (!entry.isUnreadable && matches(entry, needle)),
  );
  const tierOf = (tier: OpenWho['tier']) =>
    kept
      .filter((entry) => !entry.isUnreadable && entry.tier === tier)
      .sort(byName);
  const close = tierOf('close');
  return {
    close: [
      ...close.filter((entry) => entry.isSelf),
      ...close.filter((entry) => !entry.isSelf),
    ],
    regular: tierOf('regular'),
    others: [
      ...tierOf('passing'),
      ...kept.filter((entry) => entry.isUnreadable),
    ],
  };
}

/** The quiet line under a name: a pet's species, an organization's kind, then how they relate. */
export function getWhoLine(
  who: OpenWho,
  words: { you: string; pet: string; organization: string },
): string {
  if (who.isSelf) return words.you;
  const kind =
    who.kind === 'pet'
      ? (who.species ?? words.pet)
      : who.kind === 'organization'
        ? (who.organizationKind ?? words.organization)
        : null;
  return [kind, who.relation].filter((part) => part).join(' · ');
}
