import type { Firestore } from 'firebase-admin/firestore';

/** The oldest timestamp Worth the Wait holds for a member, or null when they have no space yet. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const spaces = await firestore
    .collection('apps/worth-the-wait/spaces')
    .where('members', 'array-contains', uid)
    .get();

  const perSpace = await Promise.all(
    spaces.docs.map(async (space) => {
      const boxes = await space.ref.collection('boxes').select('createdBy', 'createdAt').get();
      const items = await Promise.all(
        boxes.docs.map((box) =>
          box.ref.collection('items').where('authorId', '==', uid).select('createdAt').get(),
        ),
      );

      const candidates = [
        space.data().createdBy === uid ? space.data().createdAt : null,
        space.data().welcomeSeenBy?.[uid],
        ...boxes.docs.map((box) => (box.data().createdBy === uid ? box.data().createdAt : null)),
        ...items.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data().createdAt)),
      ];
      return candidates;
    }),
  );

  const numbers = perSpace.flat().filter((value): value is number => typeof value === 'number');
  const result = numbers.length > 0 ? Math.min(...numbers) : null;
  return result;
}
