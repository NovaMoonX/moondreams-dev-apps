import { store } from '@/store';
import { setLastWriteAt } from '@apps/runway/store/runwaySlice';
import { saveLastWriteAt } from '@apps/runway/utils/figuresSnapshot';

/** Notes that this phone just wrote to the plan, so the server's stored figures from before it are not drawn over it. */
export function markLocalWrite(uid: string) {
  const now = Date.now();
  saveLastWriteAt(uid, now);
  store.dispatch(setLastWriteAt(now));
}

/** A listener's half of the mark: a plain write shows as pending before the server has it. A transaction never does, so `runHeldTransaction` marks one that wrote to what the figures read. */
export function noteLocalWrite(
  uid: string,
  snapshot: { metadata: { hasPendingWrites: boolean } },
) {
  if (snapshot.metadata.hasPendingWrites) markLocalWrite(uid);
}
