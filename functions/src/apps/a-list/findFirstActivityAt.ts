import type { Firestore } from 'firebase-admin/firestore';

/** The oldest timestamp A-List holds for a member, or null when they have no data yet. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const membershipRef = firestore.doc(`apps/a-list/memberships/${uid}`);
  const [membership, firstViewing, firstWatchlistItem] = await Promise.all([
    membershipRef.get(),
    membershipRef.collection('viewings').orderBy('createdAt').limit(1).get(),
    membershipRef.collection('watchlist').orderBy('createdAt').limit(1).get(),
  ]);

  const candidates = [
    membership.data()?.createdAt,
    firstViewing.docs[0]?.data().createdAt,
    firstWatchlistItem.docs[0]?.data().createdAt,
  ].filter((value): value is number => typeof value === 'number');

  const result = candidates.length > 0 ? Math.min(...candidates) : null;
  return result;
}
