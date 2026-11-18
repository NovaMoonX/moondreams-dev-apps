import { A_LIST_HELD_KINDS } from '@apps/a-list/store/heldLists';

const COLLECTIONS = new Set<string>(
  A_LIST_HELD_KINDS.filter((kind) => kind !== 'membership'),
);

/** The kind and id of the signed-in member's own document or one record in their watchlist, viewings or theaters, which a listener list reads; anything else is never held. */
export const readAListTarget = (
  segments: string[],
  uid: string | null,
): { kind: string; id: string } | null => {
  const [apps, aList, memberships, owner, collection, id, ...rest] = segments;
  if (apps !== 'apps' || aList !== 'a-list' || memberships !== 'memberships') {
    return null;
  }
  if (owner === undefined || owner !== uid) return null;
  if (collection === undefined) return { kind: 'membership', id: owner };
  if (id === undefined || rest.length > 0) return null;
  return COLLECTIONS.has(collection) ? { kind: collection, id } : null;
};
