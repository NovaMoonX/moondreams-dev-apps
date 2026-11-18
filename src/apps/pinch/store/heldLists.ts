import { createHeldActions } from '@/store/heldLists';

/** Each kitchen collection a transaction's write can be held over, by its listener list. */
export const PINCH_HELD_KINDS = [
  'shoppingItems',
  'cooks',
  'ingredients',
  'plannedMeals',
  'recipes',
  'notes',
  'containers',
  'packages',
  'stores',
  'products',
  'collections',
] as const;

export type PinchHeldKind = (typeof PINCH_HELD_KINDS)[number];

export const pinchHeldActions = createHeldActions('pinch');
