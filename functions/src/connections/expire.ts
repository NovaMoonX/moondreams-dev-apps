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

const STATE_SWEEP_LIMIT = 400;

/** Deletes every sign-in state whose time is up, a batch at a time; returns how many. */
export async function deleteExpiredOauthStates(
  firestore: Firestore,
  now: number,
): Promise<number> {
  const snapshot = await firestore
    .collectionGroup('oauthStates')
    .where('expiresAt', '<', now)
    .limit(STATE_SWEEP_LIMIT)
    .get();
  const docs = snapshot.docs.filter((doc) =>
    doc.ref.path.startsWith('connectionsServer/'),
  );
  const batch = firestore.batch();
  docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  if (snapshot.size < STATE_SWEEP_LIMIT || docs.length === 0)
    return docs.length;
  return docs.length + (await deleteExpiredOauthStates(firestore, now));
}
