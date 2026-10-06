import type { Firestore } from 'firebase-admin/firestore';

// Every household collection whose documents carry `createdBy` and `createdAt`.
const AUTHORED_COLLECTIONS = [
  'cats',
  'conditions',
  'vaccinations',
  'preventives',
  'weightEntries',
  'symptoms',
  'visits',
  'expenses',
  'litterBoxes',
  'litters',
  'litterEntries',
  'ingestionDrafts',
  'customHealthRecordTypes',
  'customPreventiveProducts',
  'customPreventiveTypes',
  'customSymptomQuickTags',
  'customLitterTypes',
];

/** The oldest timestamp Nine Lives holds for a member, or null when they have none (joining a household leaves no timestamp). */
export async function findFirstActivityAt(firestore: Firestore, uid: string) {
  const households = await firestore
    .collection('apps/nine-lives/households')
    .where('members', 'array-contains', uid)
    .get();

  const perHousehold = await Promise.all(
    households.docs.map(async (household) => {
      const authored = await Promise.all(
        AUTHORED_COLLECTIONS.map((name) =>
          household.ref.collection(name).where('createdBy', '==', uid).select('createdAt').get(),
        ),
      );

      const candidates = [
        household.data().createdBy === uid ? household.data().createdAt : null,
        ...authored.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data().createdAt)),
      ];
      return candidates;
    }),
  );

  const numbers = perHousehold.flat().filter((value): value is number => typeof value === 'number');
  const result = numbers.length > 0 ? Math.min(...numbers) : null;
  return result;
}
