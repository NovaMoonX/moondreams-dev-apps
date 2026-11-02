import type { Firestore } from 'firebase-admin/firestore';

/** The oldest `createdAt` of a sale the member is in, or null when they are in none. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const sales = await firestore
    .collection('apps/going-once/sales')
    .where('members', 'array-contains', uid)
    .get();

  const createdAts = sales.docs
    .map((sale) => sale.data().createdAt)
    .filter((value): value is number => typeof value === 'number');

  const result = createdAts.length > 0 ? Math.min(...createdAts) : null;
  return result;
}
