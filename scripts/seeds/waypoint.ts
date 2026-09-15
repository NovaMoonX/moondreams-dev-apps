import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const TRIP_ID = 'seed-waypoint-trip';

export async function seedWaypoint(context: SeedContext): Promise<SeedResult> {
  const admin = FIXTURE_USERS.admin;
  const joinedAt = context.now - 86_400_000;
  const tripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(TRIP_ID);

  await tripRef.set({
    id: TRIP_ID,
    title: 'Pacific Northwest Weekend',
    coverImageUrl: null,
    startDate: Date.UTC(2026, 8, 25),
    endDate: Date.UTC(2026, 8, 28),
    defaultCurrency: null,
    members: {
      [admin.uid]: {
        uid: admin.uid,
        role: 'ADMIN',
        joinedAt,
      },
    },
    inviteCode: null,
    createdBy: admin.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1,
  };
}
