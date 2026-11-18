import type { DocumentData } from 'firebase/firestore';

import { createHeldTransaction } from '@/lib/firebase/heldTransaction';
import { store } from '@/store';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import { readRecipe } from '@apps/pinch/store/listeners/kitchenListeners';
import type { Recipe } from '@apps/pinch/types';
import { readPinchTarget } from '@apps/pinch/utils/heldHolds';

const isLanded = (token: string) => {
  const { pinch } = store.getState();
  return [
    pinch.shopping,
    pinch.cooks,
    pinch.ingredients,
    pinch.plannedMeals,
    pinch.recipes,
    pinch.notes,
    pinch.containers,
    pinch.packages,
    pinch.stores,
    pinch.products,
    pinch.collections,
  ].every(({ hold }) => hold.held.every((held) => held.token !== token));
};

/** A transaction whose changes to listed kitchen records show at once, go back if it fails, and are watched until the listeners show them. */
export const runHeldTransaction = createHeldTransaction({
  feature: 'Pinch',
  actions: pinchHeldActions,
  readTarget: readPinchTarget,
  open: (kind, data: DocumentData) =>
    kind === 'recipes' ? readRecipe(data as Recipe) : data,
  isLanded,
});
