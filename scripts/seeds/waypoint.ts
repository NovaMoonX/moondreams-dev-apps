import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const TRIP_ID = 'seed-waypoint-trip';

export async function seedWaypoint(context: SeedContext): Promise<SeedResult> {
  const alex = FIXTURE_USERS.partnerOne;
  const joinedAt = context.now - 86_400_000;
  const tripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(TRIP_ID);

  await tripRef.set({
    id: TRIP_ID,
    title: 'Pacific Northwest Weekend',
    coverImageUrl: null, // null for now, can be updated to the following when functionality is supported: https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZmwyNzkwOTU5NzA1Ni1pbWFnZS1rdXFtcjRxNi5qcGc.jpg
    startDate: Date.UTC(2026, 8, 25),
    endDate: Date.UTC(2026, 8, 28),
    defaultCurrency: null,
    members: {
      [alex.uid]: {
        uid: alex.uid,
        role: 'ADMIN',
        joinedAt,
      },
    },
    inviteCode: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1,
  };
}
