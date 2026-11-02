import {
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
  EMPTY_SEED_RESULT,
} from './types.ts';

const SALE_ID = 'seed-going-once-fall-clear-out';
const DAY_MS = 86_400_000;

export async function seedGoingOnce(context: SeedContext): Promise<SeedResult> {
  const maya = FIXTURE_USERS.goingOnceSeller;

  await context.firestore
    .collection('apps')
    .doc('going-once')
    .collection('sales')
    .doc(SALE_ID)
    .set({
      id: SALE_ID,
      name: 'Fall clear-out',
      pickupArea: 'Capitol Hill, Seattle',
      buyerNote: 'Evenings and weekends. Cash or Venmo.',
      currency: 'USD',
      ownerUid: maya.uid,
      createdBy: maya.uid,
      members: [maya.uid],
      createdAt: context.now - 6 * DAY_MS,
      lastEditedAt: null,
    });

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: 1 };
}
