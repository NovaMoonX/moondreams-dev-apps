import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { ReaderSink } from './sink.js';

/** Deletes every kept copy whose time has come, then clears a grant's `keptCopies` when none remain. */
export async function expireCopies(
  firestore: Firestore,
  sinks: Record<string, ReaderSink>,
  now: number,
): Promise<number> {
  const swept = await Promise.all(
    Object.values(sinks).map((sink) => sink.expire(firestore, now)),
  );
  const expired = swept.flat();
  await Promise.all(
    expired.map(async ({ uid, grantId, remainingKept }) => {
      const ref = firestore.doc(`connections/${uid}/grants/${grantId}`);
      const snapshot = await ref.get();
      const kept = snapshot.get('keptCopies') as {
        deleteAfter: number | null;
      } | null;
      if (!snapshot.exists || !kept) return;
      await ref.update({
        keptCopies:
          remainingKept > 0
            ? { count: remainingKept, deleteAfter: kept.deleteAfter }
            : null,
        updatedAt: now,
      });
    }),
  );
  logger.info('connections.expire.done', { grants: expired.length });
  return expired.length;
}
