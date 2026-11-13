import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { endAndClean, revokeUnusedAccount } from './endGrant.js';
import { errorCause } from './syncRunner.js';

/** Ends every grant a reader app holds for one person and deletes its synced copies; a Google account no remaining grant uses is revoked. A failure on one grant never stops the rest. */
export async function endReaderGrants({
  uid,
  readerAppId,
}: {
  uid: string;
  readerAppId: string;
}) {
  const snapshots = await getFirestore()
    .collection(`connections/${uid}/grants`)
    .where('readerAppId', '==', readerAppId)
    .get();
  // One at a time, so the last grant on an account is the one that revokes it.
  const outcomes = await snapshots.docs.reduce<Promise<boolean[]>>(
    async (previous, snapshot) => {
      const done = await previous;
      const isEnded = await endAndClean(uid, {
        grantId: snapshot.id,
        deleteCopies: true,
      })
        .then(() => revokeUnusedAccount(uid, snapshot.id))
        .then(() => true)
        .catch((error: unknown) => {
          logger.warn('connections.endReader.failed', {
            cause: errorCause(error),
          });
          return false;
        });
      return [...done, isEnded];
    },
    Promise.resolve([]),
  );
  const result = {
    ended: outcomes.filter(Boolean).length,
    failed: outcomes.filter((ok) => !ok).length,
  };
  return result;
}
