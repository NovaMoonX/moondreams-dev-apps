import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { openWithKey, type Keyring, type SealedPayload } from '../planKey.js';
import { grantsPath, openGrant, type ProviderGrantDoc } from './grant.js';
import { planDocPath, provider, type LinkSealed } from './linkShared.js';

/** A link is unfinished while none of the bank's accounts has been bound to one of the person's or left out. */
export const isUnfinishedLink = (link: LinkSealed) =>
  link.providerAccounts.every(
    (entry) =>
      entry.accountId === null && entry.cardId === null && !entry.isSkipped,
  );

const toBankKey = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** Revokes the grant at the provider (best effort) and deletes the link and grant documents. */
export async function discardLink(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  linkId: string,
) {
  const grantRef = firestore.doc(`${grantsPath(uid)}/${linkId}`);
  const grantSnapshot = await grantRef.get();
  if (grantSnapshot.exists) {
    await provider
      .revoke(openGrant(keyring, uid, grantSnapshot.data() as ProviderGrantDoc))
      .catch(() => {
        logger.warn('runway.link.revokeFailed');
      });
  }
  const batch = firestore.batch();
  batch.delete(grantRef);
  batch.delete(firestore.doc(planDocPath(uid, 'links', linkId)));
  await batch.commit();
}

/** Discards the person's older unfinished links at one bank, so one unfinished link per bank remains. */
export async function discardSupersededLinks(
  firestore: Firestore,
  keyring: Keyring,
  planKey: Buffer,
  uid: string,
  keep: { linkId: string; institutionName: string },
) {
  const snapshots = await firestore
    .collection(`apps/runway/plans/${uid}/links`)
    .get();
  const older = snapshots.docs.filter((snapshot) => {
    if (snapshot.id === keep.linkId || snapshot.data().status === 'revoked') {
      return false;
    }
    try {
      const link = openWithKey(
        planKey,
        snapshot.data().sealed as SealedPayload,
      ) as unknown as LinkSealed;
      return (
        toBankKey(link.institutionName) === toBankKey(keep.institutionName) &&
        isUnfinishedLink(link)
      );
    } catch {
      return false;
    }
  });
  await Promise.all(
    older.map((snapshot) =>
      discardLink(firestore, keyring, uid, snapshot.id).catch(() => {
        logger.warn('runway.link.supersedeFailed');
      }),
    ),
  );
  if (older.length > 0) {
    logger.info('runway.link.superseded', { count: older.length });
  }
}
