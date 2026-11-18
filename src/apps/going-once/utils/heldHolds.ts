import { GOING_ONCE_HELD_KINDS } from '@apps/going-once/store/heldLists';

const KINDS = new Set<string>(GOING_ONCE_HELD_KINDS);

/** The kind and id of a thing in the open sale that the items listener reads; anything else is never held. */
export const readGoingOnceTarget = (
  segments: string[],
  saleId: string | null,
): { kind: string; id: string } | null => {
  const [apps, goingOnce, sales, sale, collection, id, ...rest] = segments;
  if (apps !== 'apps' || goingOnce !== 'going-once' || sales !== 'sales') {
    return null;
  }
  if (sale === undefined || sale !== saleId) return null;
  if (collection === undefined || !KINDS.has(collection)) return null;
  return id === undefined || rest.length > 0 ? null : { kind: collection, id };
};
