import { createHeldTransaction } from '@/lib/firebase/heldTransaction';
import { store } from '@/store';
import { aListHeldActions } from '@apps/a-list/store/heldLists';
import { readAListTarget } from '@apps/a-list/utils/heldHolds';

const isLanded = (token: string) => {
  const { aList } = store.getState();
  return [
    aList.watchlist,
    aList.viewings,
    aList.theatres,
    aList.membership,
  ].every(({ hold }) => hold.held.every((held) => held.token !== token));
};

/** A transaction whose changes to the member's records show at once, go back if it fails, and are watched until the listeners show them. */
export const runHeldTransaction = createHeldTransaction({
  feature: 'A-List',
  actions: aListHeldActions,
  readTarget: readAListTarget,
  open: (_kind, data) => data,
  isLanded,
});
