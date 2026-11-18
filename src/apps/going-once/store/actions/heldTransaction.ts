import { createHeldTransaction } from '@/lib/firebase/heldTransaction';
import { store } from '@/store';
import { goingOnceHeldActions } from '@apps/going-once/store/heldLists';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import { readGoingOnceTarget } from '@apps/going-once/utils/heldHolds';

/** A transaction whose changes to a sale's things show at once, go back if it fails, and are watched until the listener shows them. */
export const runHeldTransaction = createHeldTransaction({
  feature: 'Going Once',
  actions: goingOnceHeldActions,
  readTarget: readGoingOnceTarget,
  open: (_kind, data) => {
    const { id, ...rest } = data;
    return toItem(
      String(id),
      store.getState().goingOnce.items.saleId ?? '',
      rest,
    );
  },
  isLanded: (token) =>
    store.getState().goingOnce.hold.held.every((held) => held.token !== token),
});
