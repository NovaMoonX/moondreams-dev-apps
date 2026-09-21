import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const TRIP_ID = 'seed-waypoint-trip';
const ARCHIVED_TRIP_ID = 'seed-waypoint-trip-archived';
const INVITE_CODE = 'PNW2026';
const ARCHIVED_INVITE_CODE = 'PNW2025';

export async function seedWaypoint(context: SeedContext): Promise<SeedResult> {
  const alex = FIXTURE_USERS.partnerOne;
  const jamie = FIXTURE_USERS.partnerTwo;
  const taylor = FIXTURE_USERS.nineLivesCaretaker;
  const joinedAt = context.now - 86_400_000;
  const tripTitle = 'Pacific Northwest Weekend';
  const archivedTripTitle = 'Last Year’s Coast Trip';
  const tripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(TRIP_ID);
  const archivedTripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(ARCHIVED_TRIP_ID);
  const inviteCodeRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('inviteCodes')
    .doc(INVITE_CODE);
  const archivedInviteCodeRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('inviteCodes')
    .doc(ARCHIVED_INVITE_CODE);
  const pendingRequestRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('pendingRequests')
    .doc(`${jamie.uid}_${TRIP_ID}`);
  const expenseRef = tripRef.collection('expenses').doc('seed-expense-dinner');

  await tripRef.set({
    id: TRIP_ID,
    title: tripTitle,
    coverImageUrl: null, // null for now, can be updated to the following when functionality is supported: https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZmwyNzkwOTU5NzA1Ni1pbWFnZS1rdXFtcjRxNi5qcGc.jpg
    startDate: Date.UTC(2026, 8, 25),
    endDate: Date.UTC(2026, 8, 28),
    defaultCurrency: null,
    isArchived: false,
    members: {
      [alex.uid]: {
        uid: alex.uid,
        role: 'ADMIN',
        joinedAt,
      },
      [taylor.uid]: {
        uid: taylor.uid,
        role: 'EDITOR',
        joinedAt,
      },
    },
    inviteCode: INVITE_CODE,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await archivedTripRef.set({
    id: ARCHIVED_TRIP_ID,
    title: archivedTripTitle,
    coverImageUrl: null,
    startDate: Date.UTC(2025, 8, 25),
    endDate: Date.UTC(2025, 8, 28),
    defaultCurrency: null,
    isArchived: true,
    members: {
      [alex.uid]: {
        uid: alex.uid,
        role: 'ADMIN',
        joinedAt,
      },
    },
    inviteCode: ARCHIVED_INVITE_CODE,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await inviteCodeRef.set({
    tripId: TRIP_ID,
    title: tripTitle,
  });

  await archivedInviteCodeRef.set({
    tripId: ARCHIVED_TRIP_ID,
    title: archivedTripTitle,
  });

  await pendingRequestRef.set({
    uid: jamie.uid,
    tripId: TRIP_ID,
    requestedAt: context.now - 3_600_000,
  });

  await expenseRef.set({
    id: 'seed-expense-dinner',
    tripId: TRIP_ID,
    dayIndex: 1,
    title: 'Dinner reservation',
    amount: null,
    amountMin: 80,
    amountMax: 120,
    currency: 'USD',
    payerUid: alex.uid,
    status: 'EXPECTED',
    targetType: 'EVERYONE_CURRENT',
    targetMemberIds: [alex.uid, taylor.uid],
    splitAmounts: null,
    paidMemberStatus: {
      [alex.uid]: { isPaid: false, paidAt: null },
      [taylor.uid]: { isPaid: false, paidAt: null },
    },
    createdBy: alex.uid,
    createdAt: context.now,
    lastEditedAt: context.now,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 6,
  };
}
