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
  const expensesCollection = tripRef.collection('expenses');
  const eventsCollection = tripRef.collection('events');
  const staysCollection = tripRef.collection('stays');
  const checklistCollection = tripRef.collection('checklist');

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

  const expenseMemberIds = [alex.uid, taylor.uid];
  const unpaidMemberStatus = Object.fromEntries(
    expenseMemberIds.map((uid) => [uid, { isPaid: false, paidAt: null }]),
  );
  const seedExpenses: Array<{
    id: string;
    dayIndex: number | null;
    title: string;
    amount: number | null;
    amountMin: number | null;
    amountMax: number | null;
    paidAmount: number | null;
    payerUid: string;
    status: 'PAID' | 'EXPECTED';
  }> = [
    {
      id: 'seed-expense-dinner',
      dayIndex: 1,
      title: 'Dinner reservation',
      amount: null,
      amountMin: 80,
      amountMax: 120,
      paidAmount: null,
      payerUid: alex.uid,
      status: 'EXPECTED',
    },
    {
      id: 'seed-expense-parking',
      dayIndex: 0,
      title: 'Airport parking',
      amount: 18,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: taylor.uid,
      status: 'PAID',
    },
    {
      id: 'seed-expense-hike-permits',
      dayIndex: 1,
      title: 'Discovery Park parking permit',
      amount: 12,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: alex.uid,
      status: 'PAID',
    },
    {
      id: 'seed-expense-ferry',
      dayIndex: 2,
      title: 'Bainbridge ferry tickets',
      amount: null,
      amountMin: 30,
      amountMax: 45,
      paidAmount: null,
      payerUid: taylor.uid,
      status: 'EXPECTED',
    },
    {
      id: 'seed-expense-souvenirs',
      dayIndex: null,
      title: 'Souvenirs',
      amount: 25,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: alex.uid,
      status: 'PAID',
    },
    {
      id: 'seed-expense-rental-car',
      dayIndex: 0,
      title: 'Rental car',
      amount: null,
      amountMin: 150,
      amountMax: 200,
      paidAmount: 175,
      payerUid: taylor.uid,
      status: 'PAID',
    },
  ];

  for (const seedExpense of seedExpenses) {
    await expensesCollection.doc(seedExpense.id).set({
      id: seedExpense.id,
      tripId: TRIP_ID,
      dayIndex: seedExpense.dayIndex,
      title: seedExpense.title,
      amount: seedExpense.amount,
      amountMin: seedExpense.amountMin,
      amountMax: seedExpense.amountMax,
      paidAmount: seedExpense.paidAmount,
      currency: 'USD',
      payerUid: seedExpense.payerUid,
      status: seedExpense.status,
      targetType: 'EVERYONE_CURRENT',
      targetMemberIds: expenseMemberIds,
      splitAmounts: null,
      paidMemberStatus: unpaidMemberStatus,
      createdBy: alex.uid,
      createdAt: context.now,
      lastEditedAt: context.now,
    });
  }

  await eventsCollection.doc('seed-waypoint-flight').set({
    id: 'seed-waypoint-flight',
    tripId: TRIP_ID,
    eventType: 'TRAVEL',
    dayIndex: 0,
    endDayIndex: 0,
    title: 'Flight to Seattle',
    startAt: Date.UTC(2026, 8, 25, 9),
    endAt: Date.UTC(2026, 8, 25, 11, 30),
    locationName: 'Seattle–Tacoma International Airport',
    address: null,
    latitude: 47.4502,
    longitude: -122.3088,
    eventDetails: { transitType: 'FLIGHT' },
    notes: null,
    assignedMemberIds: [alex.uid, taylor.uid],
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-dinner').set({
    id: 'seed-waypoint-dinner',
    tripId: TRIP_ID,
    eventType: 'DINING',
    dayIndex: 0,
    endDayIndex: 0,
    title: 'Dinner at Pike Place',
    startAt: Date.UTC(2026, 8, 25, 19),
    endAt: null,
    locationName: 'Pike Place Market',
    address: 'Seattle, WA',
    latitude: 47.6097,
    longitude: -122.3425,
    eventDetails: { mealType: 'DINNER' },
    notes: null,
    assignedMemberIds: [alex.uid, taylor.uid],
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-hike').set({
    id: 'seed-waypoint-hike',
    tripId: TRIP_ID,
    eventType: 'ACTIVITY',
    dayIndex: 1,
    endDayIndex: 1,
    title: 'Discovery Park hike',
    startAt: Date.UTC(2026, 8, 26, 10),
    endAt: Date.UTC(2026, 8, 26, 13),
    locationName: 'Discovery Park',
    address: '3801 Discovery Park Blvd, Seattle, WA',
    latitude: 47.6613,
    longitude: -122.4183,
    eventDetails: { settings: ['OUTDOOR'] },
    notes: null,
    assignedMemberIds: [alex.uid],
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-free-time').set({
    id: 'seed-waypoint-free-time',
    tripId: TRIP_ID,
    eventType: 'FREE_TIME',
    dayIndex: 2,
    endDayIndex: 2,
    title: 'Free time downtown',
    startAt: Date.UTC(2026, 8, 27, 14),
    endAt: null,
    locationName: null,
    address: null,
    latitude: null,
    longitude: null,
    eventDetails: {},
    notes: null,
    assignedMemberIds: [],
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await staysCollection.doc('seed-waypoint-seattle').set({
    id: 'seed-waypoint-seattle',
    tripId: TRIP_ID,
    name: 'Pike Place Suites',
    address: 'Seattle, WA',
    latitude: 47.6097,
    longitude: -122.3425,
    checkInAt: Date.UTC(2026, 8, 25, 15),
    checkOutAt: Date.UTC(2026, 8, 27, 11),
    checkInTimezone: 'America/Los_Angeles',
    plannedArrivalAt: Date.UTC(2026, 8, 25, 15),
    plannedDepartureAt: Date.UTC(2026, 8, 27, 11),
    confirmationCode: null,
    notes: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await staysCollection.doc('seed-waypoint-portland').set({
    id: 'seed-waypoint-portland',
    tripId: TRIP_ID,
    name: 'Pearl District Hotel',
    address: 'Portland, OR',
    latitude: 45.5231,
    longitude: -122.6765,
    checkInAt: Date.UTC(2026, 8, 27, 15),
    checkOutAt: Date.UTC(2026, 8, 28, 11),
    checkInTimezone: 'America/Los_Angeles',
    plannedArrivalAt: Date.UTC(2026, 8, 27, 15),
    plannedDepartureAt: Date.UTC(2026, 8, 28, 11),
    confirmationCode: null,
    notes: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
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
    assignedToUids: [alex.uid, taylor.uid],
    isCompleted: true,
    markedCompletedByUid: alex.uid,
    markedCompletedAt: context.now - 1_800_000,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now - 1_800_000,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 17,
  };
}
