import { FieldPath, type Firestore } from 'firebase-admin/firestore';

/** The oldest timestamp Waypoint holds for a member, or null when they have no trips. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const trips = await firestore
    .collection('apps/waypoint/trips')
    .where(new FieldPath('members', uid, 'uid'), '==', uid)
    .get();

  const candidates = trips.docs
    .flatMap((trip) => [
      trip.data().members?.[uid]?.joinedAt,
      trip.data().createdBy === uid ? trip.data().createdAt : null,
    ])
    .filter((value): value is number => typeof value === 'number');

  const result = candidates.length > 0 ? Math.min(...candidates) : null;
  return result;
}
