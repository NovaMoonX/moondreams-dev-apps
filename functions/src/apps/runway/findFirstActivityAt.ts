import type { Firestore } from 'firebase-admin/firestore';

/** The time the member's Runway plan was created, or null when they have no plan yet. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const plan = await firestore.doc(`apps/runway/plans/${uid}`).get();
  const createdAt = plan.data()?.createdAt;

  const result = typeof createdAt === 'number' ? createdAt : null;
  return result;
}
