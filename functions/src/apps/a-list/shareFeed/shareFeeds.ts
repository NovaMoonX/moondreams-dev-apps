import { randomInt } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';

import { getShareKind, toLiveViewings, toSharedCalendar, type SharedCalendar } from '../calendarShareView.js';

if (getApps().length === 0) {
  initializeApp();
}

const TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const FEED_ID_LENGTH = 32;

/** What a person who added a share listens to: the visitor's view of it, kept current by the server. */
export interface ShareFeed extends SharedCalendar {
  updatedAt: number;
}

export const getShareRef = (shareId: string) => getFirestore().doc(`apps/a-list/calendarShares/${shareId}`);
export const getFeedRef = (feedId: string) => getFirestore().doc(`apps/a-list/shareFeeds/${feedId}`);

const newFeedId = () => Array.from({ length: FEED_ID_LENGTH }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join('');

export async function readLiveViewings(ownerUid: string) {
  const snapshot = await getFirestore().collection(`apps/a-list/memberships/${ownerUid}/viewings`).get();
  return toLiveViewings(snapshot.docs.map((viewing) => viewing.data()));
}

function toFeed(share: DocumentData, liveViewings: Awaited<ReturnType<typeof readLiveViewings>>): ShareFeed {
  return { ...toSharedCalendar(share, liveViewings), updatedAt: Date.now() };
}

/**
 * The feed id for a share, making the feed on first use. The id is a secret of its own: changing the PIN or deleting the share retires it,
 * so everyone listening loses access at once.
 */
export async function ensureShareFeed(shareId: string): Promise<string | null> {
  const db = getFirestore();
  const result = await db.runTransaction(async (transaction) => {
    const shareSnapshot = await transaction.get(getShareRef(shareId));
    const share = shareSnapshot.data();
    if (share === undefined) return null;
    if (typeof share.feedId === 'string' && share.feedId !== '') return share.feedId as string;

    const ownerUid = typeof share.ownerUid === 'string' ? share.ownerUid : '';
    const liveViewings = getShareKind(share) === 'LIVE' && ownerUid !== '' ? await readLiveViewings(ownerUid) : [];
    const feedId = newFeedId();
    transaction.set(getFeedRef(feedId), toFeed(share, liveViewings));
    transaction.update(getShareRef(shareId), { feedId });
    return feedId;
  });
  return result;
}

/** Rewrites every live feed of one member from their calendar as it is now, so runs that arrive out of order still end current. */
export async function refreshLiveFeeds(ownerUid: string) {
  const shares = await getFirestore().collection('apps/a-list/calendarShares').where('ownerUid', '==', ownerUid).get();
  const liveShares = shares.docs
    .map((share) => share.data())
    .filter((share) => getShareKind(share) === 'LIVE' && typeof share.feedId === 'string' && share.feedId !== '');
  if (liveShares.length === 0) return 0;

  const liveViewings = await readLiveViewings(ownerUid);
  await Promise.all(liveShares.map((share) => getFeedRef(share.feedId as string).set(toFeed(share, liveViewings))));
  return liveShares.length;
}
