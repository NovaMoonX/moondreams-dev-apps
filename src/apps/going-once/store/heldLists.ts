import { createHeldActions } from '@/store/heldLists';

/** Each collection of an open sale a transaction's write can be held over, by its listener list. */
export const GOING_ONCE_HELD_KINDS = ['items', 'bundles'] as const;

export const goingOnceHeldActions = createHeldActions('goingOnce');
