import type { DocumentData, Transaction } from 'firebase/firestore';

import { auth } from '@/lib/firebase/config';
import {
  projectRecordedWrites,
  runRecordedTransaction,
  type RecordedReads,
  type RecordedWrite,
} from '@/lib/firebase/recordedTransaction';
import { watchWriteLanded } from '@/lib/firebase/syncWatchdog';
import { store } from '@/store';
import { generateUuid } from '@/utils';
import {
  dropPinchWrites,
  holdPinchWrites,
  settlePinchWrites,
  type PinchHeldKind,
} from '@apps/pinch/store/heldLists';
import { readRecipe } from '@apps/pinch/store/listeners/kitchenListeners';
import type { Recipe } from '@apps/pinch/types';
import { buildPinchHolds } from '@apps/pinch/utils/heldHolds';

const open = (kind: PinchHeldKind, data: DocumentData): DocumentData =>
  kind === 'recipes' ? readRecipe(data as Recipe) : data;

const isLanded = (token: string) => () => {
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
export async function runHeldTransaction<T>(
  uid: string,
  body: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const token = generateUuid();
  const hold = async (writes: RecordedWrite[], reads: RecordedReads) => {
    const projected = await projectRecordedWrites(writes, reads).catch(
      () => null,
    );
    const built =
      projected === null ? null : buildPinchHolds(projected, uid, token, open);
    if (built === null || auth.currentUser?.uid !== uid) {
      store.dispatch(dropPinchWrites(token));
      return;
    }
    store.dispatch(holdPinchWrites({ token, writes: built }));
  };
  try {
    const result = await runRecordedTransaction(body, hold);
    store.dispatch(settlePinchWrites(token));
    void watchWriteLanded({
      feature: 'Pinch',
      what: 'a change you made',
      hasLanded: isLanded(token),
    });
    return result;
  } catch (error) {
    store.dispatch(dropPinchWrites(token));
    throw error;
  }
}
