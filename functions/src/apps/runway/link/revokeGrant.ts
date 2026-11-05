import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { grantsPath, openGrant, type ProviderGrantDoc } from './grant.js';
import { provider } from './linkShared.js';
import type { Keyring } from '../planKey.js';

/** Revokes the grant at the provider and deletes it; false (grant kept for a repeat call) when the provider or the key says no. */
export async function revokeAndDelete(
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

/** Retries the revoke for each of the caller's unlinked links whose grant an earlier unlink had to keep; how many it finished. */
export async function finishRevokedLinks(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
): Promise<number> {
  const revoked = await firestore
    .collection(`apps/runway/plans/${uid}/links`)
    .where('status', '==', 'revoked')
    .get();
  const outcomes = await Promise.all(
    revoked.docs.map(async (link) => {
      const grantRef = firestore.doc(`${grantsPath(uid)}/${link.id}`);
      const grant = await grantRef.get();
      if (!grant.exists) return false;
      return revokeAndDelete(
        keyring,
        uid,
        grant.data() as ProviderGrantDoc,
        grantRef,
      );
    }),
  );
  return outcomes.filter(Boolean).length;
}
