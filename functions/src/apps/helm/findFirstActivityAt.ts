import type { Firestore } from 'firebase-admin/firestore';

/** The oldest `createdAt` of a capture or task the member has, or null when they have neither yet. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const oldest = await Promise.all(
    ['captures', 'tasks'].map((collection) =>
      firestore
        .collection(`apps/helm/users/${uid}/${collection}`)
        .orderBy('createdAt', 'asc')
        .limit(1)
        .get(),
    ),
  );

  const createdAts = oldest
    .flatMap((snapshot) => snapshot.docs.map((doc) => doc.data().createdAt))
    .filter((value): value is number => typeof value === 'number');

  const result = createdAts.length > 0 ? Math.min(...createdAts) : null;
  return result;
}
