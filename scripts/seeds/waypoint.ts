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
const EVENING_TRIP_ID = 'seed-waypoint-trip-evening';
const EVENING_INVITE_CODE = 'WINDDOWN';
const EMPTY_TRIP_ID = 'seed-waypoint-trip-empty';
const EMPTY_INVITE_CODE = 'FRESHSTART';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const TRIP_TIMEZONE = 'America/Los_Angeles';

const pad = (value: number) => String(value).padStart(2, '0');
const toClock = (totalMinutes: number) =>
  `${pad(Math.floor(totalMinutes / 60) % 24)}:${pad(totalMinutes % 60)}`;

/** An instant's calendar date (as UTC midnight) and minutes since midnight, read on a wall clock in `timeZone`. */
function getWallClock(epoch: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(epoch));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    dateUtc: Date.UTC(read('year'), read('month') - 1, read('day')),
    minutes: read('hour') * 60 + read('minute'),
  };
}

/** A relative event's time fields; `null` zone follows the trip's. */
function relativeEventTime({
  day,
  endDay = day,
  start,
  end = null,
  timezone = null,
}: {
  day: number;
  endDay?: number;
  start: string;
  end?: string | null;
  timezone?: string | null;
}) {
  return {
    dayIndex: day,
    endDayIndex: end === null ? day : endDay,
    startAt: null,
    endAt: null,
    startTime: start,
    endTime: end,
    timezone,
  };
}

/** A relative stay's day + time fields; the planned arrival/departure start out equal to the booking. */
function relativeStayTime(checkIn: [number, string], checkOut: [number, string]) {
  return {
    checkInAt: null,
    checkOutAt: null,
    plannedArrivalAt: null,
    plannedDepartureAt: null,
    checkInDayIndex: checkIn[0],
    checkInTime: checkIn[1],
    checkOutDayIndex: checkOut[0],
    checkOutTime: checkOut[1],
    plannedArrivalDayIndex: checkIn[0],
    plannedArrivalTime: checkIn[1],
    plannedDepartureDayIndex: checkOut[0],
    plannedDepartureTime: checkOut[1],
  };
}

export async function seedWaypoint(context: SeedContext): Promise<SeedResult> {
  const alex = FIXTURE_USERS.partnerOne;
  const jamie = FIXTURE_USERS.partnerTwo;
  const nova = FIXTURE_USERS.admin;
  const taylor = FIXTURE_USERS.nineLivesCaretaker;
  const joinedAt = context.now - 86_400_000;
  const tripTitle = 'Pacific Northwest Weekend';
  // Kept relative to `context.now` (unlike the archived trip, which is meant to stay in
  // the past) so this trip is always upcoming, regardless of when the seed runs.
  const upcomingAnchor = new Date(context.now + 14 * DAY_MS);
  const upcomingTripStart = Date.UTC(
    upcomingAnchor.getUTCFullYear(),
    upcomingAnchor.getUTCMonth(),
    upcomingAnchor.getUTCDate(),
  );
  const upcomingTripEnd = upcomingTripStart + 3 * DAY_MS;
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
    .doc(`${nova.uid}_${TRIP_ID}`);
  const expensesCollection = tripRef.collection('expenses');
  const eventsCollection = tripRef.collection('events');
  const staysCollection = tripRef.collection('stays');
  const checklistCollection = tripRef.collection('checklist');

  await tripRef.set({
    id: TRIP_ID,
    title: tripTitle,
    coverImageUrl:
      'https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZmwyNzkwOTU5NzA1Ni1pbWFnZS1rdXFtcjRxNi5qcGc.jpg',
    startDate: upcomingTripStart,
    endDate: upcomingTripEnd,
    timeModel: 'RELATIVE',
    timezone: TRIP_TIMEZONE,
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
      [jamie.uid]: {
        uid: jamie.uid,
        role: 'COMMENTER',
        joinedAt,
      },
    },
    inviteCode: INVITE_CODE,
    sharedAlbumUrl: null,
    sharedAlbumSetByUid: null,
    sharedAlbumSetAt: null,
    dateShiftStatus: null,
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
    timeModel: 'RELATIVE',
    timezone: TRIP_TIMEZONE,
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
    dateShiftStatus: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  const activeTripTitle = 'Olympic Peninsula Loop';
  // Day 2 of 4 in the trip's own time zone, so "today" is always inside the trip wherever the seed runs.
  const nowOnTripClock = getWallClock(context.now, TRIP_TIMEZONE);
  const activeTripStart = nowOnTripClock.dateUtc - DAY_MS;
  const activeTripEnd = activeTripStart + 3 * DAY_MS;
  // Anchored to local calendar days, not trip-start offsets, so the two stays always check in
  // on different days and the later one lands on today whatever time the seed runs.
  const startOfToday = new Date(context.now).setHours(0, 0, 0, 0);
  // Where seed time falls on the trip's clock, so one event genuinely spans "now" and one stay checks in later today.
  const lunchStartMinutes = Math.max(0, nowOnTripClock.minutes - 30);
  const lunchEndMinutes = Math.min(1439, nowOnTripClock.minutes + 30);
  const kalalochCheckInMinutes = Math.min(nowOnTripClock.minutes + 180, 1410);

  await activeTripRef.set({
    id: ACTIVE_TRIP_ID,
    title: activeTripTitle,
    coverImageUrl: null,
    startDate: activeTripStart,
    endDate: activeTripEnd,
    timeModel: 'RELATIVE',
    timezone: TRIP_TIMEZONE,
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
    dateShiftStatus: null,
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
    uid: nova.uid,
    tripId: TRIP_ID,
    requestedAt: context.now - 3_600_000,
  });

  const expenseMemberIds = [alex.uid, taylor.uid, jamie.uid];
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
    isPerPerson?: boolean;
    targetType?: 'EVERYONE_CURRENT' | 'EVERYONE_INCLUDING_FUTURE' | 'JUST_ME' | 'SPECIFIC_MEMBERS';
    targetMemberIds?: string[];
    splitAmounts?: Record<string, number> | null;
    repaidBy?: string[];
  }> = [
    {
      id: 'seed-expense-breakfast',
      dayIndex: 2,
      title: 'Breakfast pastries',
      amount: 9,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: null,
      status: 'EXPECTED',
      category: 'FOOD',
      isPerPerson: true,
    },
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
      repaidBy: [jamie.uid],
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
      // Taylor pays here while Alex pays most other expenses in this trip — the two directions
      // are intentionally circular (each owes the other), exercising the Dues summary's
      // full-breakdown-with-net-highlighted rendering for that case.
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
      splitAmounts: { [alex.uid]: 10, [taylor.uid]: 20, [jamie.uid]: 10 },
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
    {
      id: 'seed-expense-groceries',
      dayIndex: 0,
      title: 'Groceries for the cabin',
      amount: 54,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: jamie.uid,
      status: 'PAID',
      category: 'FOOD',
    },
    {
      id: 'seed-expense-trailhead-lunch',
      dayIndex: 1,
      title: 'Trailhead lunch',
      amount: 36,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: taylor.uid,
      status: 'PAID',
      category: 'FOOD',
      repaidBy: [alex.uid],
    },
    {
      id: 'seed-expense-coffee',
      dayIndex: 2,
      title: 'Coffee run',
      amount: 15,
      amountMin: null,
      amountMax: null,
      paidAmount: null,
      payerUid: jamie.uid,
      status: 'PAID',
      category: 'FOOD',
      targetType: 'SPECIFIC_MEMBERS',
      targetMemberIds: [alex.uid, jamie.uid],
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
      paidMemberStatus: {
        ...unpaidMemberStatus,
        ...Object.fromEntries(
          (seedExpense.repaidBy ?? []).map((uid) => [uid, { isPaid: true, paidAt: context.now - 3_600_000 }]),
        ),
      },
      note: seedExpense.note ?? null,
      groupLabel: seedExpense.groupLabel ?? null,
      isPerPerson: seedExpense.isPerPerson ?? false,
      createdBy: alex.uid,
      createdAt: context.now,
      lastEditedAt: context.now,
    });
  }

  await eventsCollection.doc('seed-waypoint-flight').set({
    id: 'seed-waypoint-flight',
    tripId: TRIP_ID,
    eventType: 'TRAVEL',
    ...relativeEventTime({ day: 0, start: '09:00', end: '11:05', timezone: 'America/New_York' }),
    title: 'Flight DL 482',
    locationName: 'John F. Kennedy International Airport',
    address: null,
    latitude: 40.6413,
    longitude: -73.7781,
    eventDetails: {
      transitType: 'FLIGHT',
      transitDetails: {
        airline: 'Delta Air Lines',
        airlineIataCode: 'DL',
        airlineIcaoCode: 'DAL',
        flightNumber: 'DL 482',
        confirmationCode: 'XK7P2Q',
        departureAirportCode: 'JFK',
        arrivalAirportCode: 'ORD',
        notes: null,
        estimatedTravelTimeMs: 7_500_000,
      },
    },
    notes: 'Check in online the night before — carry-ons only.',
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    linkKind: null,
    groupLabel: 'Flights to Seattle',
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-flight-2').set({
    id: 'seed-waypoint-flight-2',
    tripId: TRIP_ID,
    eventType: 'TRAVEL',
    ...relativeEventTime({ day: 0, start: '12:30', end: '14:30', timezone: 'America/New_York' }),
    title: 'Flight DL 1190',
    locationName: 'Seattle-Tacoma International Airport',
    address: null,
    latitude: 47.4502,
    longitude: -122.3088,
    eventDetails: {
      transitType: 'FLIGHT',
      transitDetails: {
        airline: 'Delta Air Lines',
        airlineIataCode: 'DL',
        airlineIcaoCode: 'DAL',
        flightNumber: 'DL 1190',
        confirmationCode: 'XK7P2Q',
        departureAirportCode: 'ORD',
        arrivalAirportCode: 'SEA',
        notes: null,
        estimatedTravelTimeMs: 15_600_000,
      },
    },
    notes: 'Check in online the night before — carry-ons only.',
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    linkKind: null,
    groupLabel: 'Flights to Seattle',
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-dinner').set({
    id: 'seed-waypoint-dinner',
    tripId: TRIP_ID,
    eventType: 'DINING',
    ...relativeEventTime({ day: 0, start: '19:00', end: null }),
    title: 'Dinner at Pike Place',
    locationName: 'Pike Place Market',
    address: 'Seattle, WA',
    latitude: 47.6097,
    longitude: -122.3425,
    eventDetails: { mealType: 'DINNER', cuisines: ['Seafood', 'Market fare'] },
    notes: 'Reservation is under Alex. Ask for a window table if one opens up.',
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
    linkKind: 'MENU',
    groupLabel: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-hike').set({
    id: 'seed-waypoint-hike',
    tripId: TRIP_ID,
    eventType: 'ACTIVITY',
    ...relativeEventTime({ day: 1, start: '10:00', end: '13:00' }),
    title: 'Discovery Park hike',
    locationName: 'Discovery Park',
    address: '3801 Discovery Park Blvd, Seattle, WA',
    latitude: 47.6613,
    longitude: -122.4183,
    eventDetails: { settings: ['OUTDOOR'] },
    notes: 'Bring layers and the trail map; the lot fills up by 9am.',
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
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-free-time').set({
    id: 'seed-waypoint-free-time',
    tripId: TRIP_ID,
    eventType: 'FREE_TIME',
    ...relativeEventTime({ day: 2, start: '14:00', end: null }),
    title: 'Free time downtown',
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
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
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
    ...relativeStayTime([0, '15:00'], [2, '11:00']),
    checkInTimezone: null,
    confirmationCode: null,
    notes: 'Door code is 4821. Parking is in the garage off Western Ave.',
    place: null,
    linkUrl: 'https://www.airbnb.com/rooms/00000000',
    linkPreview: {
      title: 'Pike Place Suites',
      description: 'Stylish suites steps from Pike Place Market.',
      imageUrl: 'https://picsum.photos/seed/waypoint-seattle-stay/800/450',
      siteName: 'airbnb.com',
      fetchedAt: context.now,
    },
    changeHistory: [],
    seenBy: {},
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
    ...relativeStayTime([2, '15:00'], [3, '11:00']),
    checkInTimezone: null,
    confirmationCode: null,
    notes: null,
    place: null,
    linkUrl: null,
    linkPreview: null,
    changeHistory: [],
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await eventsCollection.doc('seed-waypoint-family-call').set({
    id: 'seed-waypoint-family-call',
    tripId: TRIP_ID,
    eventType: 'ACTIVITY',
    ...relativeEventTime({ day: 1, start: '18:00', end: '18:30', timezone: 'America/Chicago' }),
    title: 'Catch-up call with the family',
    locationName: null,
    address: null,
    latitude: null,
    longitude: null,
    eventDetails: { settings: ['INDOOR'] },
    notes: null,
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await staysCollection.doc('seed-waypoint-denver').set({
    id: 'seed-waypoint-denver',
    tripId: TRIP_ID,
    name: 'Denver Airport Hotel',
    stayType: 'HOTEL',
    address: 'Denver, CO',
    latitude: 39.8561,
    longitude: -104.6737,
    ...relativeStayTime([3, '19:30'], [3, '23:00']),
    checkInTimezone: 'America/Denver',
    confirmationCode: null,
    notes: 'Short overnight on the way home — shuttle runs every 20 minutes.',
    place: null,
    linkUrl: null,
    linkPreview: null,
    changeHistory: [],
    seenBy: {},
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
    ...relativeEventTime({ day: 0, start: '09:00', end: '11:00' }),
    title: 'Ferry to Bainbridge Island',
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
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
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
    ...relativeEventTime({
      day: 1,
      start: toClock(lunchStartMinutes),
      end: toClock(lunchEndMinutes),
    }),
    title: 'Lunch at Salt Creek',
    locationName: 'Salt Creek Recreation Area',
    address: null,
    latitude: 48.1585,
    longitude: -123.6928,
    eventDetails: { mealType: 'LUNCH' },
    notes: 'Cash only at the snack shack — grab some at the ferry terminal.',
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
    reminderId: 'seed-waypoint-reminder-alex',
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await activeEventsCollection.doc('active-trip-tidepools').set({
    id: 'active-trip-tidepools',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'ACTIVITY',
    ...relativeEventTime({ day: 1, start: '10:00', end: '13:00' }),
    title: 'Tidepooling at Salt Creek',
    locationName: 'Salt Creek Recreation Area',
    address: null,
    latitude: 48.1585,
    longitude: -123.6928,
    eventDetails: { settings: ['OUTDOOR'] },
    notes: 'Low tide is around 2pm. Wear shoes that can get wet.',
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [alex.uid, taylor.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [
      {
        changes: [
          {
            field: 'startTime',
            previousValue: '09:00',
            changedBy: alex.uid,
            changedAt: context.now - 3_600_000,
          },
        ],
        latestChangedBy: alex.uid,
        latestChangedAt: context.now - 3_600_000,
      },
    ],
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now - 3_600_000,
  });

  await activeEventsCollection.doc('active-trip-dinner').set({
    id: 'active-trip-dinner',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'DINING',
    ...relativeEventTime({ day: 2, start: '18:00' }),
    title: 'Dinner in Port Angeles',
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
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await activeEventsCollection.doc('active-trip-home-call').set({
    id: 'active-trip-home-call',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'ACTIVITY',
    ...relativeEventTime({ day: 2, start: '12:00', end: '12:30', timezone: 'America/New_York' }),
    title: 'Check in with the family back home',
    locationName: null,
    address: null,
    latitude: null,
    longitude: null,
    eventDetails: { settings: ['INDOOR'] },
    notes: null,
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  // Demonstrates the archived state — superseded plans stay available under "Show archived"
  // instead of being deleted outright.
  await activeEventsCollection.doc('active-trip-old-museum').set({
    id: 'active-trip-old-museum',
    tripId: ACTIVE_TRIP_ID,
    eventType: 'ACTIVITY',
    ...relativeEventTime({ day: 2, start: '14:00', end: '16:00' }),
    title: 'Feiro Marine Life Center',
    locationName: 'Feiro Marine Life Center',
    address: 'Port Angeles, WA',
    latitude: 48.1226,
    longitude: -123.4307,
    eventDetails: { settings: ['INDOOR'] },
    notes: null,
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    reminderMinutesBefore: 20,
    reminderEnabled: true,
    reminderId: null,
    isArchived: true,
    archivedBy: alex.uid,
    archivedAt: context.now - 1_800_000,
    seenBy: {},
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
    ...relativeStayTime([0, '16:00'], [1, '11:00']),
    checkInTimezone: null,
    confirmationCode: null,
    notes: 'Front desk closes at 10pm - call ahead for a late arrival.',
    place: null,
    linkUrl: null,
    linkPreview: null,
    changeHistory: [],
    seenBy: {},
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await activeStaysCollection.doc('active-trip-kalaloch').set({
    id: 'active-trip-kalaloch',
    tripId: ACTIVE_TRIP_ID,
    name: 'Kalaloch Lodge Bluff Cabin',
    stayType: 'RENTAL',
    address: '157151 US-101, Forks, WA',
    latitude: 47.6124,
    longitude: -124.3743,
    ...relativeStayTime([1, toClock(kalalochCheckInMinutes)], [3, '11:00']),
    checkInTimezone: null,
    confirmationCode: 'KAL-48213',
    notes:
      'Check in at the main lodge, then drive down to the bluff cabins. No cell service past Forks, so grab the door code before you lose signal.\n\nFirewood is sold at the front desk.',
    place: null,
    linkUrl: 'https://www.thekalalochlodge.com/',
    linkPreview: null,
    changeHistory: [
      {
        changes: [
          {
            field: 'checkInTime',
            previousValue: toClock(Math.max(0, kalalochCheckInMinutes - 120)),
            changedBy: taylor.uid,
            changedAt: context.now - 2_700_000,
          },
        ],
        latestChangedBy: taylor.uid,
        latestChangedAt: context.now - 2_700_000,
      },
    ],
    seenBy: {},
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

  const activeAnnouncementsCollection = activeTripRef.collection('announcements');
  const activeEventSuggestionsCollection = activeTripRef.collection('eventSuggestions');

  await activeAnnouncementsCollection.doc('active-trip-road-closure').set({
    id: 'active-trip-road-closure',
    tripId: ACTIVE_TRIP_ID,
    severity: 'URGENT',
    title: 'Highway 101 closure near Forks',
    body: 'A rockslide has closed 101 north of Forks. Add ~45 minutes and take the detour through Sappho if you are heading to Kalaloch today.',
    expiresAt: activeTripEnd,
    dismissedBy: {},
    createdBy: alex.uid,
    createdAt: context.now - 3_600_000,
  });

  await activeAnnouncementsCollection.doc('active-trip-welcome').set({
    id: 'active-trip-welcome',
    tripId: ACTIVE_TRIP_ID,
    severity: 'INFO',
    title: 'Welcome to the loop!',
    body: "Itinerary's live — check Overview each morning for the day's plan. Ping the group chat if anything needs to shift.",
    expiresAt: null,
    // Shows the per-member dismiss in action — Taylor has already seen this one.
    dismissedBy: { [taylor.uid]: context.now - 7_200_000 },
    createdBy: alex.uid,
    createdAt: joinedAt,
  });

  await activeEventSuggestionsCollection.doc('active-trip-dinner-suggestion').set({
    id: 'active-trip-dinner-suggestion',
    tripId: ACTIVE_TRIP_ID,
    eventId: 'active-trip-dinner',
    suggestedTitle: 'Dinner at Downriggers',
    suggestedStartAt: null,
    suggestedEndAt: null,
    suggestedDayIndex: 2,
    suggestedStartTime: '18:00',
    suggestedEndTime: null,
    suggestedLocationName: 'Downriggers on the Waterfront',
    suggestedAddress: '115 E Railroad Ave, Port Angeles, WA',
    suggestedLatitude: 48.1215,
    suggestedLongitude: -123.4307,
    suggestedPlace: null,
    note: 'Better views and they take reservations — the original spot is walk-in only.',
    upvotedBy: [taylor.uid],
    createdBy: taylor.uid,
    createdAt: context.now - 1_800_000,
  });

  const seedIdea = (
    tripId: string,
    id: string,
    idea: {
      ideaType: 'RESTAURANT' | 'ACTIVITY';
      title: string;
      linkUrl: string | null;
      notes: string | null;
      ideaDetails: Record<string, unknown> | null;
      addedByUid: string;
      voterUids: string[];
      convertedToEntityId: string | null;
      createdAt: number;
    },
  ) =>
    context.firestore
      .collection('apps')
      .doc('waypoint')
      .collection('trips')
      .doc(tripId)
      .collection('ideas')
      .doc(id)
      .set({ id, tripId, ...idea, lastEditedAt: idea.createdAt });

  await Promise.all([
    seedIdea(TRIP_ID, 'seed-idea-ramen', {
      ideaType: 'RESTAURANT',
      title: 'Ramen at Tsujita',
      linkUrl: 'https://www.tsujita.com',
      notes: 'Rich tonkotsu broth — go early to skip the line.',
      ideaDetails: {
        cuisines: ['Ramen', 'Japanese'],
        suggestedDays: [0],
        suggestedTimeBlocks: ['EVENING'],
      },
      addedByUid: jamie.uid,
      voterUids: [jamie.uid, alex.uid, taylor.uid],
      convertedToEntityId: null,
      createdAt: context.now - 3 * 86_400_000,
    }),
    seedIdea(TRIP_ID, 'seed-idea-brunch', {
      ideaType: 'RESTAURANT',
      title: 'Brunch at Portage Bay Cafe',
      linkUrl: null,
      notes: null,
      ideaDetails: {
        cuisines: ['Brunch'],
        suggestedDays: [],
        suggestedTimeBlocks: ['MORNING', 'AFTERNOON'],
      },
      addedByUid: taylor.uid,
      voterUids: [taylor.uid, alex.uid],
      convertedToEntityId: null,
      createdAt: context.now - 2 * 86_400_000,
    }),
    seedIdea(TRIP_ID, 'seed-idea-rattlesnake', {
      ideaType: 'ACTIVITY',
      title: 'Rattlesnake Ledge hike',
      linkUrl: 'https://www.wta.org/go-hiking/hikes/rattlesnake-ledge',
      notes: 'About 4 miles round trip with a great view of the lake.',
      ideaDetails: { settings: ['OUTDOOR'], suggestedDays: [1], suggestedTimeBlocks: ['MORNING'] },
      addedByUid: alex.uid,
      voterUids: [alex.uid, jamie.uid],
      convertedToEntityId: null,
      createdAt: context.now - 2 * 86_400_000,
    }),
    seedIdea(TRIP_ID, 'seed-idea-museum', {
      ideaType: 'ACTIVITY',
      title: 'Museum of Pop Culture',
      linkUrl: null,
      notes: null,
      ideaDetails: { settings: ['INDOOR'], suggestedDays: [], suggestedTimeBlocks: [] },
      addedByUid: jamie.uid,
      voterUids: [jamie.uid],
      convertedToEntityId: null,
      createdAt: context.now - 86_400_000,
    }),
    seedIdea(TRIP_ID, 'seed-idea-market', {
      ideaType: 'ACTIVITY',
      title: 'Pike Place Market stroll',
      linkUrl: null,
      notes: null,
      ideaDetails: null,
      addedByUid: alex.uid,
      voterUids: [alex.uid, taylor.uid],
      createdAt: context.now - 12 * 3_600_000,
      convertedToEntityId: null,
    }),
    seedIdea(TRIP_ID, 'seed-idea-dinner', {
      ideaType: 'RESTAURANT',
      title: 'Dinner at Canlis',
      linkUrl: null,
      notes: 'Already on the schedule.',
      ideaDetails: { cuisines: ['Pacific Northwest'], suggestedDays: [0], suggestedTimeBlocks: ['EVENING'] },
      addedByUid: alex.uid,
      voterUids: [alex.uid, taylor.uid, jamie.uid],
      convertedToEntityId: 'seed-waypoint-dinner',
      createdAt: context.now - 4 * 86_400_000,
    }),
    seedIdea(ACTIVE_TRIP_ID, 'active-idea-lunch', {
      ideaType: 'RESTAURANT',
      title: 'Seafood lunch in Port Angeles',
      linkUrl: null,
      notes: null,
      ideaDetails: { cuisines: ['Seafood'], suggestedDays: [], suggestedTimeBlocks: ['AFTERNOON'] },
      addedByUid: taylor.uid,
      voterUids: [taylor.uid, alex.uid],
      convertedToEntityId: 'active-trip-lunch',
      createdAt: joinedAt,
    }),
    seedIdea(ACTIVE_TRIP_ID, 'active-idea-tidepools', {
      ideaType: 'ACTIVITY',
      title: 'Ruby Beach tide pools',
      linkUrl: null,
      notes: 'Check the tide chart first.',
      ideaDetails: { settings: ['OUTDOOR'], suggestedDays: [], suggestedTimeBlocks: [] },
      addedByUid: alex.uid,
      voterUids: [alex.uid],
      convertedToEntityId: null,
      createdAt: joinedAt,
    }),
  ]);

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

  const eveningTripTitle = 'Skagit Valley Day Trip';
  const eveningTripStart = startOfToday - DAY_MS;
  const eveningTripRef = context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(EVENING_TRIP_ID);

  await eveningTripRef.set({
    id: EVENING_TRIP_ID,
    title: eveningTripTitle,
    coverImageUrl: null,
    startDate: eveningTripStart,
    endDate: startOfToday + 3 * DAY_MS,
    defaultCurrency: null,
    isArchived: false,
    members: {
      [alex.uid]: { uid: alex.uid, role: 'ADMIN', joinedAt },
      [taylor.uid]: { uid: taylor.uid, role: 'EDITOR', joinedAt },
    },
    inviteCode: EVENING_INVITE_CODE,
    sharedAlbumUrl: null,
    sharedAlbumSetByUid: null,
    sharedAlbumSetAt: null,
    dateShiftStatus: 'IDLE',
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  await context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('inviteCodes')
    .doc(EVENING_INVITE_CODE)
    .set({ tripId: EVENING_TRIP_ID, title: eveningTripTitle });

  // A trip with nothing planned yet, so every section's empty state is always reachable.
  const emptyTripTitle = 'Oregon Coast Getaway';
  const emptyAnchor = new Date(context.now + 30 * DAY_MS);
  const emptyTripStart = Date.UTC(
    emptyAnchor.getUTCFullYear(),
    emptyAnchor.getUTCMonth(),
    emptyAnchor.getUTCDate(),
  );

  await context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('trips')
    .doc(EMPTY_TRIP_ID)
    .set({
      id: EMPTY_TRIP_ID,
      title: emptyTripTitle,
      coverImageUrl: null,
      startDate: emptyTripStart,
      endDate: emptyTripStart + 2 * DAY_MS,
      timeModel: 'RELATIVE',
      timezone: TRIP_TIMEZONE,
      defaultCurrency: null,
      isArchived: false,
      members: { [alex.uid]: { uid: alex.uid, role: 'ADMIN', joinedAt } },
      inviteCode: EMPTY_INVITE_CODE,
      sharedAlbumUrl: null,
      sharedAlbumSetByUid: null,
      sharedAlbumSetAt: null,
      dateShiftStatus: null,
      createdBy: alex.uid,
      createdAt: joinedAt,
      lastEditedAt: context.now,
    });

  await context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('inviteCodes')
    .doc(EMPTY_INVITE_CODE)
    .set({ tripId: EMPTY_TRIP_ID, title: emptyTripTitle });

  // Every event today has already ended and the next one is tomorrow, so the Overview
  // shows its "done for today" state whatever time the seed runs.
  const eveningEvents = [
    { id: 'evening-breakfast', type: 'DINING', title: 'Breakfast at the Calico Cupboard', place: 'Calico Cupboard Cafe', start: context.now - 9 * HOUR_MS, end: context.now - 8 * HOUR_MS },
    { id: 'evening-tulips', type: 'ACTIVITY', title: 'Tulip fields walk', place: 'Roozengaarde', start: context.now - 7 * HOUR_MS, end: context.now - 4 * HOUR_MS },
    { id: 'evening-dinner', type: 'DINING', title: 'Dinner in La Conner', place: 'La Conner Seafood & Prime Rib House', start: context.now - 3 * HOUR_MS, end: context.now - 90 * 60_000 },
    { id: 'evening-whales', type: 'ACTIVITY', title: 'Morning whale watch', place: 'Anacortes Marina', start: startOfToday + DAY_MS + 9 * HOUR_MS, end: startOfToday + DAY_MS + 12 * HOUR_MS },
  ] as const;

  await Promise.all(
    eveningEvents.map((event) => {
      const dayIndex = Math.floor((event.start - eveningTripStart) / DAY_MS);
      return eveningTripRef.collection('events').doc(event.id).set({
        id: event.id,
        tripId: EVENING_TRIP_ID,
        eventType: event.type,
        dayIndex,
        endDayIndex: Math.floor((event.end - eveningTripStart) / DAY_MS),
        title: event.title,
        startAt: event.start,
        endAt: event.end,
        locationName: event.place,
        address: null,
        latitude: null,
        longitude: null,
        eventDetails: null,
        notes: null,
        attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
        assignedMemberIds: [],
        venueOpenTime: null,
        venueCloseTime: null,
        changeHistory: [],
        place: null,
        linkUrl: null,
        linkPreview: null,
        reminderMinutesBefore: 20,
        reminderEnabled: false,
        reminderId: null,
        isArchived: false,
        archivedBy: null,
        archivedAt: null,
        seenBy: { [alex.uid]: context.now, [taylor.uid]: context.now },
        createdBy: alex.uid,
        createdAt: joinedAt,
        lastEditedAt: joinedAt,
      });
    }),
  );

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 59,
  };
}
