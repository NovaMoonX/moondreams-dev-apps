import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const TRIP_ID = 'seed-waypoint-trip';
const INVITE_CODE = 'PNW2026';

export async function seedWaypoint(context: SeedContext): Promise<SeedResult> {
  const alex = FIXTURE_USERS.partnerOne;
  const jamie = FIXTURE_USERS.partnerTwo;
  const joinedAt = context.now - 86_400_000;
  const tripTitle = 'Pacific Northwest Weekend';
  const tripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(TRIP_ID);
  const inviteCodeRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('inviteCodes')
    .doc(INVITE_CODE);
  const pendingRequestRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('pendingRequests')
    .doc(`${jamie.uid}_${TRIP_ID}`);
  const checklistCollection = tripRef.collection('checklist');

  await tripRef.set({
    id: TRIP_ID,
    title: tripTitle,
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
    inviteCode: INVITE_CODE,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await inviteCodeRef.set({
    tripId: TRIP_ID,
    title: tripTitle,
  });

  await pendingRequestRef.set({
    uid: jamie.uid,
    tripId: TRIP_ID,
    requestedAt: context.now - 3_600_000,
  });

  await checklistCollection.doc('confirm-passports').set({
    id: 'confirm-passports',
    tripId: TRIP_ID,
    title: 'Confirm passport expiration dates',
    category: 'DOCUMENTS',
    customCategoryLabel: null,
    assignedToUids: [alex.uid],
    isCompleted: false,
    markedCompletedByUid: null,
    markedCompletedAt: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await checklistCollection.doc('book-dinner').set({
    id: 'book-dinner',
    tripId: TRIP_ID,
    title: 'Book the first-night dinner',
    category: 'BOOKINGS',
    customCategoryLabel: null,
    assignedToUids: [alex.uid, jamie.uid],
    isCompleted: true,
    markedCompletedByUid: alex.uid,
    markedCompletedAt: context.now - 1_800_000,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now - 1_800_000,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 5,
  };
}
