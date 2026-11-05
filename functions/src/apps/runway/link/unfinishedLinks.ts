import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { openWithKey, type Keyring, type SealedPayload } from '../planKey.js';
import {
  grantsPath,
  itemIndexPath,
  openGrant,
  type ProviderGrantDoc,
} from './grant.js';
import { planDocPath, provider, type LinkSealed } from './linkShared.js';

/** A link is unfinished while none of the bank's accounts has been bound to one of the person's or left out. */
export const isUnfinishedLink = (link: LinkSealed) =>
  link.providerAccounts.every(
    (entry) =>
      entry.accountId === null && entry.cardId === null && !entry.isSkipped,
  );

const toBankKey = (value: string) => value.toLowerCase().replace(/\s+/g, '');

const openLink = (planKey: Buffer, sealed: unknown) =>
  openWithKey(planKey, sealed as SealedPayload) as unknown as LinkSealed;

/** Deletes an unfinished link, its grant and its item index entry in a transaction (an attach that lands first wins), then revokes the grant; false when it was gone or finished. */
export async function discardLink(
  firestore: Firestore,
  keyring: Keyring,
  planKey: Buffer,
  uid: string,
  linkId: string,
) {
  const linkRef = firestore.doc(planDocPath(uid, 'links', linkId));
  const grantRef = firestore.doc(`${grantsPath(uid)}/${linkId}`);
  const grantDoc = await firestore.runTransaction(async (transaction) => {
    const [linkSnapshot, grantSnapshot] = await transaction.getAll(
      linkRef,
      grantRef,
    );
    if (
      !linkSnapshot.exists ||
      !isUnfinishedLink(openLink(planKey, linkSnapshot.data()?.sealed))
    ) {
      return null;
    }
    transaction.delete(linkRef);
    transaction.delete(grantRef);
    if (!grantSnapshot.exists) return { isMissing: true as const };
    const grant = grantSnapshot.data() as ProviderGrantDoc;
    transaction.delete(firestore.doc(itemIndexPath(grant.providerItemId)));
    return grant;
  });
  if (grantDoc === null) return false;
  if (!('isMissing' in grantDoc)) {
    await provider.revoke(openGrant(keyring, uid, grantDoc)).catch(() => {
      logger.warn('runway.link.revokeFailed');
    });
  }
  return true;
}

/** Discards the person's unfinished links at one bank made before this one, so one unfinished link per bank remains. */
export async function discardSupersededLinks(
  firestore: Firestore,
  keyring: Keyring,
  planKey: Buffer,
  uid: string,
  keep: { linkId: string; institutionName: string; createdAt: number },
) {
  const snapshots = await firestore
    .collection(`apps/runway/plans/${uid}/links`)
    .get();
  const older = snapshots.docs.filter((snapshot) => {
    const data = snapshot.data();
    if (
      snapshot.id === keep.linkId ||
      data.status === 'revoked' ||
      !(data.createdAt < keep.createdAt)
    ) {
      return false;
    }
    try {
      const link = openLink(planKey, data.sealed);
      return (
        toBankKey(link.institutionName) === toBankKey(keep.institutionName) &&
        isUnfinishedLink(link)
      );
    } catch {
      return false;
    }
  });
  const discarded = await Promise.all(
    older.map((snapshot) =>
      discardLink(firestore, keyring, planKey, uid, snapshot.id).catch(() => {
        logger.warn('runway.link.supersedeFailed');
        return false;
      }),
    ),
  );
  const count = discarded.filter(Boolean).length;
  if (count > 0) logger.info('runway.link.superseded', { count });
}
