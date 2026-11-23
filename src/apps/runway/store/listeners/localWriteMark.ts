import { saveLastWriteAt } from '@apps/runway/utils/figuresSnapshot';

/**
 * Notes on this device that it just wrote to the plan, so on a later open the server's figures from before
 * the write are not drawn over it. The open in progress keeps its head start: a write before the ledger is
 * read would otherwise drop every figure to a half-read ledger.
 */
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
