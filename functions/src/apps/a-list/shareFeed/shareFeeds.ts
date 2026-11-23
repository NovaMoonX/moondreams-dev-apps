import { randomInt } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

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

const readText = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/** Whether a share's feed was made under the PIN it has now; a feed made under an older PIN is retired, never handed out. */
export const isFeedCurrent = (share: DocumentData) =>
  readText(share.feedId) !== null && readText(share.feedPin) === readText(share.pin);

/**
 * The feed id for a share, making the feed on first use, or null when the share is gone or its PIN is no longer the one the caller passed.
 * The id is a secret of its own: changing the PIN or deleting the share retires it, so everyone listening loses access at once.
 */
export async function ensureShareFeed(shareId: string, checkedPin: string | null): Promise<string | null> {
  return getFirestore().runTransaction(async (transaction) => {
    const shareRef = getShareRef(shareId);
    const share = (await transaction.get(shareRef)).data();
    if (share === undefined || readText(share.pin) !== checkedPin) return null;

    const oldFeedId = readText(share.feedId);
    if (oldFeedId !== null && isFeedCurrent(share)) {
      const feed = await transaction.get(getFeedRef(oldFeedId));
      if (feed.exists) return oldFeedId;
    }

    const ownerUid = readText(share.ownerUid);
    const liveViewings = getShareKind(share) === 'LIVE' && ownerUid !== null ? await readLiveViewings(ownerUid) : [];
    const feedId = newFeedId();
    if (oldFeedId !== null) transaction.delete(getFeedRef(oldFeedId));
    transaction.set(getFeedRef(feedId), toFeed(share, liveViewings));
    transaction.update(shareRef, { feedId, feedPin: readText(share.pin) });
    return feedId;
  });
}

/**
 * Takes a share's feed away: clears the share's pointer and deletes the feed in one transaction, so an id is never handed out after
 * the feed it names is gone. Skips a share whose feed was already replaced or still matches its PIN.
 */
export async function retireShareFeed(shareId: string, feedId: string) {
  await getFirestore().runTransaction(async (transaction) => {
    const shareRef = getShareRef(shareId);
    const share = (await transaction.get(shareRef)).data();
    if (share !== undefined) {
      if (readText(share.feedId) !== feedId || isFeedCurrent(share)) return;
      transaction.update(shareRef, { feedId: null, feedPin: null });
    }
    transaction.delete(getFeedRef(feedId));
  });
}

/**
 * Rewrites the live feeds of one member from their calendar as it is now, so runs that arrive out of order still end current.
 * Each write re-reads its share and feed in a transaction, so a feed retired meanwhile is never brought back, and an unchanged feed is left alone.
 */
export async function refreshLiveFeeds(ownerUid: string) {
  const db = getFirestore();
  const shares = await db.collection('apps/a-list/calendarShares').where('ownerUid', '==', ownerUid).get();
  const liveShares = shares.docs.filter((share) => getShareKind(share.data()) === 'LIVE' && isFeedCurrent(share.data()));
  if (liveShares.length === 0) return 0;

  const liveViewings = await readLiveViewings(ownerUid);
  const written = await Promise.all(
    liveShares.map((shareSnapshot) =>
      db.runTransaction(async (transaction) => {
        const share = (await transaction.get(shareSnapshot.ref)).data();
        const feedId = share === undefined || !isFeedCurrent(share) ? null : readText(share.feedId);
        if (feedId === null) return false;
        const feed = await transaction.get(getFeedRef(feedId));
        if (!feed.exists || isDeepStrictEqual(feed.data()?.viewings, liveViewings)) return false;
        transaction.update(getFeedRef(feedId), { viewings: liveViewings, updatedAt: Date.now() });
        return true;
      }),
    ),
  );
  return written.filter(Boolean).length;
}
