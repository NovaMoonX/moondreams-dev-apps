import { saveLastWriteAt } from '@apps/runway/utils/figuresSnapshot';

/** Notes that this device just wrote to the plan, so a later open never draws server figures from before the write; the open in progress keeps its head start. */
export function markLocalWrite(uid: string) {
  saveLastWriteAt(uid, Date.now());
}

/** A listener's half of the mark: a plain write shows as pending before the server has it. A transaction never does, so `runHeldTransaction` marks one that wrote to what the figures read. */
export function noteLocalWrite(
  uid: string,
  snapshot: { metadata: { hasPendingWrites: boolean } },
) {
  if (snapshot.metadata.hasPendingWrites) markLocalWrite(uid);
}
