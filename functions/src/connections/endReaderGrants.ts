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
  const outcomes: boolean[] = [];
  for (const snapshot of snapshots.docs) {
    try {
      await endAndClean(uid, { grantId: snapshot.id, deleteCopies: true });
      await revokeUnusedAccount(uid, snapshot.id);
      outcomes.push(true);
    } catch (error) {
      logger.warn('connections.endReader.failed', {
        cause: errorCause(error),
      });
      outcomes.push(false);
    }
  }
  const result = {
    ended: outcomes.filter(Boolean).length,
    failed: outcomes.filter((ok) => !ok).length,
  };
  return result;
}
