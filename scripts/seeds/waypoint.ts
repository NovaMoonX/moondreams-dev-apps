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
  const eventsCollection = tripRef.collection('events');
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
    firestoreDocuments: 11,
  };
}
