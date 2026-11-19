import { createHeldTransaction } from '@/lib/firebase/heldTransaction';
import { store } from '@/store';
import { goingOnceHeldActions } from '@apps/going-once/store/heldLists';
import { toBundle } from '@apps/going-once/store/listeners/toBundle';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import { readGoingOnceTarget } from '@apps/going-once/utils/heldHolds';

/** A transaction whose changes to a sale's things show at once, go back if it fails, and are watched until the listener shows them. */
export const runHeldTransaction = createHeldTransaction({
  feature: 'Going Once',
  actions: goingOnceHeldActions,
  readTarget: readGoingOnceTarget,
  open: (kind, data) => {
    const { id, ...rest } = data;
    const { items, bundles } = store.getState().goingOnce;
    return kind === 'bundles'
      ? toBundle(String(id), bundles.saleId ?? '', rest)
      : toItem(String(id), items.saleId ?? '', rest);
  },
  isLanded: (token) => {
    const { hold, bundleHold } = store.getState().goingOnce;
    return [...hold.held, ...bundleHold.held].every(
      (held) => held.token !== token,
    );
  },
});
