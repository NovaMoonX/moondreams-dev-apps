import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  grantsPath,
  itemIndexPath,
  openGrant,
  type ProviderGrantDoc,
} from './link/grant.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
  provider,
} from './link/linkShared.js';
import type { Keyring } from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Revokes the grant at the provider and deletes it; false (grant kept for a repeat call) when the provider or the key says no. */
async function revokeAndDelete(
  keyring: Keyring,
  uid: string,
  grantDoc: ProviderGrantDoc,
  grantRef: DocumentReference,
) {
  try {
    await provider.revoke(openGrant(keyring, uid, grantDoc));
    await grantRef.delete();
    return true;
  } catch {
    logger.warn('runway.link.unlinkRevokeFailed', {
      linkId: grantDoc.linkId,
    });
    return false;
  }
}

/**
 * `{ linkId }` → `{ unlinked, isRevokedAtBank }`: stops a finished link for good. The link is marked `revoked` and its item index entry removed in one
 * transaction (so the webhook, the backstop and a refresh skip it from then on), then the grant is revoked at the provider and deleted. Purchases, cards
 * and accounts that came from the link are left as they are. A repeat on a revoked link only finishes what an earlier call left undone.
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
