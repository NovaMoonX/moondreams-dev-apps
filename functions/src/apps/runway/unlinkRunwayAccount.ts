import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  grantsPath,
  itemIndexPath,
  type ProviderGrantDoc,
} from './link/grant.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
} from './link/linkShared.js';
import { revokeAndDelete } from './link/revokeGrant.js';

if (getApps().length === 0) {
  initializeApp();
}

/**
 * `{ linkId }` → `{ unlinked, isRevokedAtBank }`: stops a finished link for good, keeping everything it brought in.
 * A repeat on a revoked link only finishes what an earlier call left undone.
 */
export const unlinkRunwayAccount = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to unlink a bank.');
    }
    const linkId: unknown = request.data?.linkId;
    if (
      typeof linkId !== 'string' ||
      linkId === '' ||
      linkId === '.' ||
      linkId === '..' ||
      linkId.includes('/')
    ) {
      throw new HttpsError('invalid-argument', 'That link is missing.');
    }

    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const linkRef = firestore.doc(planDocPath(uid, 'links', linkId));
    const grantRef = firestore.doc(`${grantsPath(uid)}/${linkId}`);

    const grantDoc = await firestore.runTransaction(async (transaction) => {
      const [linkSnapshot, grantSnapshot] = await transaction.getAll(
        linkRef,
        grantRef,
      );
      if (!linkSnapshot.exists) {
        throw new HttpsError('not-found', 'That bank link is already gone.');
      }
      if (linkSnapshot.data()?.status !== 'revoked') {
        transaction.update(linkRef, { status: 'revoked' });
      }
      transaction.delete(
        firestore.doc(planDocPath(uid, 'recurringCharges', linkId)),
      );
      if (!grantSnapshot.exists) return null;
      const grant = grantSnapshot.data() as ProviderGrantDoc;
      transaction.delete(firestore.doc(itemIndexPath(grant.providerItemId)));
      return grant;
    });

    const isRevokedAtBank =
      grantDoc === null ||
      (await revokeAndDelete(keyring, uid, grantDoc, grantRef));
    logger.info('runway.link.unlinked', { linkId, isRevokedAtBank });
    const result = { unlinked: true, isRevokedAtBank };
    return result;
  },
);
