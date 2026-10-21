import type { Firestore } from 'firebase-admin/firestore';

const KITCHEN_COLLECTIONS = [
  'ingredients',
  'recipes',
  'meals',
  'plannedMeals',
  'products',
  'stores',
  'sources',
  'collections',
  'shoppingItems',
  'ideas',
  'cooks',
  'notes',
  'containers',
  'packages',
];

/** The oldest timestamp Pinch holds for a member's kitchen, or null when they have none yet. */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const kitchenRef = firestore.doc(`apps/pinch/kitchens/${uid}`);
  const [kitchen, ...oldest] = await Promise.all([
    kitchenRef.get(),
    ...KITCHEN_COLLECTIONS.map((name) => kitchenRef.collection(name).orderBy('createdAt').limit(1).get()),
  ]);

  const candidates = [kitchen.data()?.createdAt, ...oldest.map((snapshot) => snapshot.docs[0]?.data().createdAt)].filter(
    (value): value is number => typeof value === 'number',
  );

  const result = candidates.length > 0 ? Math.min(...candidates) : null;
  return result;
}
