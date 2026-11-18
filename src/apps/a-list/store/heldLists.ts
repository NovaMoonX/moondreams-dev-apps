import { createHeldActions } from '@/store/heldLists';

/** Each of the member's collections a transaction's write can be held over, by its listener; `membership` is the member's own document, held over a list of one. */
export const A_LIST_HELD_KINDS = [
  'watchlist',
  'viewings',
  'theatres',
  'membership',
] as const;

/** A listener's record as the held lists keep it: the document id beside the stored fields. */
export type WithId<T> = T & { id: string };

export const aListHeldActions = createHeldActions('aList');
