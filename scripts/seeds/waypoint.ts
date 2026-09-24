import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const TRIP_ID = 'seed-waypoint-trip';
const ARCHIVED_TRIP_ID = 'seed-waypoint-trip-archived';
const ACTIVE_TRIP_ID = 'seed-waypoint-trip-active';
const INVITE_CODE = 'PNW2026';
const ARCHIVED_INVITE_CODE = 'PNW2025';
const ACTIVE_INVITE_CODE = 'ONTHEGO';
const DAY_MS = 86_400_000;

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
  const activeTripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(ACTIVE_TRIP_ID);
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
  const activeInviteCodeRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('inviteCodes')
    .doc(ACTIVE_INVITE_CODE);
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
    coverImageUrl:
      'https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZmwyNzkwOTU5NzA1Ni1pbWFnZS1rdXFtcjRxNi5qcGc.jpg',
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
    sharedAlbumUrl: null,
    sharedAlbumSetByUid: null,
    sharedAlbumSetAt: null,
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
    sharedAlbumUrl: null,
    sharedAlbumSetByUid: null,
    sharedAlbumSetAt: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  const activeTripTitle = 'Olympic Peninsula Loop';
  const activeTripStart = context.now - DAY_MS;
  const activeTripEnd = context.now + 2 * DAY_MS;

  await activeTripRef.set({
    id: ACTIVE_TRIP_ID,
    title: activeTripTitle,
    coverImageUrl: null,
    startDate: activeTripStart,
    endDate: activeTripEnd,
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
    inviteCode: ACTIVE_INVITE_CODE,
    sharedAlbumUrl: null,
    sharedAlbumSetByUid: null,
    sharedAlbumSetAt: null,
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

  await activeInviteCodeRef.set({
    tripId: ACTIVE_TRIP_ID,
    title: activeTripTitle,
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
    payerUid: string | null;
    status: 'PAID' | 'EXPECTED';
    category: 'FOOD' | 'TRANSPORT' | 'LODGING' | 'ACTIVITIES' | 'SHOPPING' | 'OTHER';
    note?: string | null;
    groupLabel?: string | null;
    targetType?: 'EVERYONE_CURRENT' | 'EVERYONE_INCLUDING_FUTURE' | 'JUST_ME' | 'SPECIFIC_MEMBERS';
    targetMemberIds?: string[];
    splitAmounts?: Record<string, number> | null;
  }> = [
    {
      id: 'seed-expense-dinner',
      dayIndex: 1,
      title: 'Dinner reservation',
      amount: null,
      amountMin: 80,
      amountMax: 120,
      paidAmount: null,
      payerUid: null,
      status: 'EXPECTED',
      category: 'FOOD',
    },
    {
      id: 'seed-expense-parking',
      dayIndex: 0,
      title: 'Airport parking',
      amount: 18,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      // Paid by each person separately — showcases the "no single payer" case.
      payerUid: null,
      status: 'PAID',
      category: 'TRANSPORT',
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
      category: 'ACTIVITIES',
    },
    {
      id: 'seed-expense-ferry',
      dayIndex: 2,
      title: 'Bainbridge ferry tickets',
      amount: null,
      amountMin: 30,
      amountMax: 45,
      paidAmount: null,
      payerUid: null,
      status: 'EXPECTED',
      category: 'TRANSPORT',
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
      category: 'SHOPPING',
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
      category: 'TRANSPORT',
    },
    {
      id: 'seed-expense-museum-tickets',
      dayIndex: 1,
      title: 'Museum tickets',
      amount: 40,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: alex.uid,
      status: 'PAID',
      category: 'ACTIVITIES',
      note: 'Tickets are non-refundable.',
      groupLabel: 'Pike Place museum visit',
      targetType: 'SPECIFIC_MEMBERS',
      targetMemberIds: expenseMemberIds,
      splitAmounts: { [alex.uid]: 15, [taylor.uid]: 25 },
    },
    {
      id: 'seed-expense-museum-giftshop',
      dayIndex: 1,
      title: 'Museum gift shop',
      amount: 10,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: alex.uid,
      status: 'PAID',
      category: 'SHOPPING',
      groupLabel: 'Pike Place museum visit',
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
      category: seedExpense.category,
      customCategoryLabel: null,
      targetType: seedExpense.targetType ?? 'EVERYONE_CURRENT',
      targetMemberIds: seedExpense.targetMemberIds ?? expenseMemberIds,
      splitAmounts: seedExpense.splitAmounts ?? null,
      paidMemberStatus: unpaidMemberStatus,
      note: seedExpense.note ?? null,
      groupLabel: seedExpense.groupLabel ?? null,
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
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
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
    attendeeTargetType: 'EVERYONE_CURRENT',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: 'https://www.pikeplacemarket.org/',
    linkPreview: {
      title: 'Pike Place Market',
      description: 'The heart and soul of Seattle since 1907.',
      imageUrl: 'https://picsum.photos/seed/waypoint-dinner/800/450',
      siteName: 'pikeplacemarket.org',
      fetchedAt: context.now,
    },
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
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
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid],
    // Showcases the optional venue hours field — the park's posted open/close times.
    venueOpenTime: '06:00',
    venueCloseTime: '22:00',
    changeHistory: [],
    place: {
      placeId: 'ChIJVVVVVVVVVVVVVVVVVVVVVVU',
      mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJVVVVVVVVVVVVVVVVVVVVVVU',
      primaryType: 'park',
      photoUrl: 'https://picsum.photos/seed/waypoint-hike/800/450',
      photoRefreshedAt: context.now,
    },
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
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
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await staysCollection.doc('seed-waypoint-seattle').set({
    id: 'seed-waypoint-seattle',
    tripId: TRIP_ID,
    name: 'Pike Place Suites',
    stayType: 'RENTAL',
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
    place: null,
    linkUrl: 'https://www.airbnb.com/rooms/00000000',
    linkPreview: {
      title: 'Pike Place Suites',
      description: 'Stylish suites steps from Pike Place Market.',
      imageUrl: 'https://picsum.photos/seed/waypoint-seattle-stay/800/450',
      siteName: 'airbnb.com',
      fetchedAt: context.now,
    },
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await staysCollection.doc('seed-waypoint-portland').set({
    id: 'seed-waypoint-portland',
    tripId: TRIP_ID,
    name: 'Pearl District Hotel',
    stayType: 'HOTEL',
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
    note: 'Needs at least 6 months of validity left.',
    completeByDayIndex: 0,
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
    note: null,
    completeByDayIndex: 0,
    assignedToUids: [alex.uid, taylor.uid],
    isCompleted: true,
    markedCompletedByUid: alex.uid,
    markedCompletedAt: context.now - 1_800_000,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now - 1_800_000,
  });

  const activeEventsCollection = activeTripRef.collection('events');
  const activeStaysCollection = activeTripRef.collection('stays');
  const activeChecklistCollection = activeTripRef.collection('checklist');

  await activeEventsCollection.doc('active-trip-ferry').set({
    id: 'active-trip-ferry',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'TRAVEL',
    dayIndex: 0,
    endDayIndex: 0,
    title: 'Ferry to Bainbridge Island',
    startAt: activeTripStart + 9 * 3_600_000,
    endAt: activeTripStart + 11 * 3_600_000,
    locationName: 'Bainbridge Island Ferry Terminal',
    address: null,
    latitude: 47.6238,
    longitude: -122.5108,
    eventDetails: { transitType: 'FERRY' },
    notes: null,
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  // Straddles seed time (not activeTripStart-relative like its siblings) so a
  // fresh seed always has one event genuinely ACTIVE right now, matching what
  // the Overview HUD's Active Now card needs to demonstrate.
  await activeEventsCollection.doc('active-trip-lunch').set({
    id: 'active-trip-lunch',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'DINING',
    dayIndex: 1,
    endDayIndex: 1,
    title: 'Lunch at Salt Creek',
    startAt: context.now - 1_800_000,
    endAt: context.now + 1_800_000,
    locationName: 'Salt Creek Recreation Area',
    address: null,
    latitude: 48.1585,
    longitude: -123.6928,
    eventDetails: { mealType: 'LUNCH' },
    notes: null,
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: {
      placeId: 'ChIJWWWWWWWWWWWWWWWWWWWWWWW',
      mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJWWWWWWWWWWWWWWWWWWWWWWW',
      primaryType: 'park',
      photoUrl: 'https://picsum.photos/seed/waypoint-salt-creek/800/450',
      photoRefreshedAt: context.now,
    },
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await activeEventsCollection.doc('active-trip-tidepools').set({
    id: 'active-trip-tidepools',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'ACTIVITY',
    dayIndex: 1,
    endDayIndex: 1,
    title: 'Tidepooling at Salt Creek',
    startAt: activeTripStart + DAY_MS + 10 * 3_600_000,
    endAt: activeTripStart + DAY_MS + 13 * 3_600_000,
    locationName: 'Salt Creek Recreation Area',
    address: null,
    latitude: 48.1585,
    longitude: -123.6928,
    eventDetails: { settings: ['OUTDOOR'] },
    notes: null,
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [
      {
        changes: [
          {
            field: 'startAt',
            previousValue: activeTripStart + DAY_MS + 9 * 3_600_000,
            changedBy: alex.uid,
            changedAt: context.now - 3_600_000,
          },
        ],
        latestChangedBy: alex.uid,
        latestChangedAt: context.now - 3_600_000,
      },
    ],
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now - 3_600_000,
  });

  await activeEventsCollection.doc('active-trip-dinner').set({
    id: 'active-trip-dinner',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'DINING',
    dayIndex: 2,
    endDayIndex: 2,
    title: 'Dinner in Port Angeles',
    startAt: activeTripStart + 2 * DAY_MS + 18 * 3_600_000,
    endAt: null,
    locationName: 'Port Angeles',
    address: null,
    latitude: 48.1181,
    longitude: -123.4307,
    eventDetails: { mealType: 'DINNER' },
    notes: null,
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await activeStaysCollection.doc('active-trip-lodge').set({
    id: 'active-trip-lodge',
    tripId: ACTIVE_TRIP_ID,
    name: 'Lake Crescent Lodge',
    stayType: 'HOTEL',
    address: '416 Lake Crescent Rd, Port Angeles, WA',
    latitude: 48.0587,
    longitude: -123.7853,
    checkInAt: activeTripStart + 16 * 3_600_000,
    checkOutAt: activeTripEnd,
    checkInTimezone: 'America/Los_Angeles',
    plannedArrivalAt: activeTripStart + 16 * 3_600_000,
    plannedDepartureAt: activeTripEnd,
    confirmationCode: null,
    notes: 'Front desk closes at 10pm — call ahead for a late arrival.',
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await activeChecklistCollection.doc('active-trip-tide-tables').set({
    id: 'active-trip-tide-tables',
    tripId: ACTIVE_TRIP_ID,
    title: 'Check tide tables for Salt Creek',
    category: 'LOGISTICS',
    customCategoryLabel: null,
    note: null,
    completeByDayIndex: 1,
    assignedToUids: [alex.uid],
    isCompleted: false,
    markedCompletedByUid: null,
    markedCompletedAt: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await context.firestore.collection('reminders').doc('seed-waypoint-reminder-alex').set({
    id: 'seed-waypoint-reminder-alex',
    appId: 'waypoint',
    targetUids: [alex.uid],
    title: 'Lunch at Salt Creek',
    body: 'Starting in 20 minutes.',
    scheduledFor: context.now + 15_000,
    status: 'pending',
    channels: ['push'],
    relatedEntityPath: `apps/waypoint/trips/${ACTIVE_TRIP_ID}/events/active-trip-lunch`,
    recurrence: 'none',
    createdBy: alex.uid,
    createdAt: context.now,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 28,
  };
}
