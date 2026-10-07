import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';
import { seedWaypointScaleTrip } from './waypointScale.ts';

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
  endTimezone = null,
}: {
  day: number;
  endDay?: number;
  start: string;
  end?: string | null;
  timezone?: string | null;
  /** The end's zone when it differs from the start's. */
  endTimezone?: string | null;
}) {
  return {
    dayIndex: day,
    endDayIndex: end === null ? day : endDay,
    startAt: null,
    endAt: null,
    startTime: start,
    endTime: end,
    timezone,
    endTimezone,
  };
}

/** An absolute-time trip's event fields from start/end instants. */
function absoluteEventTime(startAt: number, endAt: number, tripStart: number) {
  return {
    dayIndex: Math.floor((startAt - tripStart) / DAY_MS),
    endDayIndex: Math.floor((endAt - tripStart) / DAY_MS),
    startAt,
    endAt,
    startTime: null,
    endTime: null,
    timezone: null,
    endTimezone: null,
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
  // the past) so this trip is always upcoming, regardless of when the seed runs. Ten days
  // out keeps it inside the 14-day weather window.
  const upcomingAnchor = new Date(context.now + 10 * DAY_MS);
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
    linkedTo?: { kind: 'EVENT' | 'STAY' | 'RENTAL'; id: string } | null;
    targetType?: 'EVERYONE_CURRENT' | 'EVERYONE_INCLUDING_FUTURE' | 'JUST_ME' | 'SPECIFIC_MEMBERS';
    targetMemberIds?: string[];
    splitAmounts?: Record<string, number> | null;
    repaidBy?: string[];
    earlyPayments?: Record<string, { toUid: string; amount: number; paidAt: number; isReturned: boolean; returnedAt: number | null }>;
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
      // Taylor already sent Alex their part, ahead of the reservation being paid.
      earlyPayments: {
        [taylor.uid]: { toUid: alex.uid, amount: 25, paidAt: context.now - 7_200_000, isReturned: false, returnedAt: null },
      },
      linkedTo: { kind: 'EVENT', id: 'seed-waypoint-dinner' },
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
      linkedTo: { kind: 'EVENT', id: 'seed-waypoint-hike' },
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
      linkedTo: { kind: 'RENTAL', id: 'seed-waypoint-rental-sea' },
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
      earlyPayments: seedExpense.earlyPayments ?? {},
      note: seedExpense.note ?? null,
      groupLabel: seedExpense.groupLabel ?? null,
      isPerPerson: seedExpense.isPerPerson ?? false,
      linkedTo: seedExpense.linkedTo ?? null,
      createdBy: alex.uid,
      createdAt: context.now,
      lastEditedAt: context.now,
    });
  }

  await eventsCollection.doc('seed-waypoint-flight').set({
    id: 'seed-waypoint-flight',
    tripId: TRIP_ID,
    eventType: 'TRAVEL',
    ...relativeEventTime({
      day: 0,
      start: '09:00',
      end: '11:05',
      timezone: 'America/New_York',
      endTimezone: 'America/Chicago',
    }),
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
    assignedMemberIds: [alex.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    linkKind: null,
    groupLabel: 'Flights to Seattle',
    stackLabel: 'Everyone arriving',
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
    ...relativeEventTime({
      day: 0,
      start: '12:30',
      end: '14:30',
      timezone: 'America/Chicago',
      endTimezone: 'America/Los_Angeles',
    }),
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
    assignedMemberIds: [alex.uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    linkKind: null,
    groupLabel: 'Flights to Seattle',
    stackLabel: 'Everyone arriving',
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

  await tripRef.collection('rentals').doc('seed-waypoint-rental-sea').set({
    id: 'seed-waypoint-rental-sea',
    tripId: TRIP_ID,
    rentalType: 'CAR',
    name: 'Hertz',
    vehicle: 'Toyota RAV4 or similar',
    pickupAddress: 'Seattle-Tacoma International Airport Rental Car Facility, SeaTac, WA',
    pickupLatitude: 47.4436,
    pickupLongitude: -122.3009,
    pickupPlace: null,
    returnAddress: 'Portland International Airport Rental Car Center, Portland, OR',
    returnLatitude: 45.5887,
    returnLongitude: -122.5975,
    returnPlace: null,
    pickupDayIndex: 0,
    pickupTime: '10:30',
    returnDayIndex: 3,
    returnTime: '16:00',
    timezone: null,
    confirmationCode: 'H-7731942',
    notes: 'One-way rental, so the drop-off fee is already included. Fuel tank full on return.',
    linkUrl: null,
    linkPreview: null,
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

  await checklistCollection.doc('book-rental-early').set({
    id: 'book-rental-early',
    tripId: TRIP_ID,
    title: 'Book the rental car before prices climb',
    category: 'BOOKINGS',
    customCategoryLabel: null,
    note: 'Due two months ahead; it stays two months before the trip if the dates move.',
    completeByDayIndex: -60,
    assignedToUids: [alex.uid],
    isCompleted: false,
    markedCompletedByUid: null,
    markedCompletedAt: null,
    createdBy: alex.uid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });

  // A pre-approved invitation: Jamie joins the empty trip as an Editor without asking.
  await context.firestore
    .collection('apps')
    .doc('waypoint')
    .collection('emailInvites')
    .doc(`${EMPTY_TRIP_ID}_${jamie.email}`)
    .set({
      tripId: EMPTY_TRIP_ID,
      email: jamie.email,
      role: 'EDITOR',
      invitedBy: alex.uid,
      invitedAt: context.now,
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
    eventDetails: {
      transitType: 'FERRY',
      transitDetails: {
        operator: 'Washington State Ferries',
        confirmationCode: 'WSF-48820',
        departurePort: 'Bainbridge Island Ferry Terminal',
        arrivalPort: 'Seattle',
        notes: null,
        estimatedTravelTimeMs: null,
      },
    },
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

  // Picks up later today, so Overview shows the pickup card whenever the seed runs.
  await activeTripRef.collection('rentals').doc('active-trip-rental').set({
    id: 'active-trip-rental',
    tripId: ACTIVE_TRIP_ID,
    rentalType: 'CAR',
    name: 'Enterprise',
    vehicle: 'Subaru Outback or similar',
    pickupAddress: '1100 E Front St, Port Angeles, WA',
    pickupLatitude: 48.1175,
    pickupLongitude: -123.4217,
    pickupPlace: null,
    returnAddress: null,
    returnLatitude: null,
    returnLongitude: null,
    returnPlace: null,
    pickupDayIndex: 1,
    pickupTime: toClock(Math.min(nowOnTripClock.minutes + 90, 1410)),
    returnDayIndex: 3,
    returnTime: '10:00',
    timezone: null,
    confirmationCode: 'ENT-20458',
    notes: null,
    linkUrl: null,
    linkPreview: null,
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

  // One of every transit type across the three live trips, so each badge color, card layout
  // and route line can be eyeballed. The event's own location mirrors the route's place.
  const travelEvents = [
    {
      collection: eventsCollection,
      id: 'seed-waypoint-drive',
      tripId: TRIP_ID,
      title: 'Drive to Pike Place Suites',
      time: relativeEventTime({ day: 0, start: '15:30', end: '16:15' }),
      place: { name: 'Pike Place Suites', latitude: 47.6088, longitude: -122.3402 },
      transitType: 'DRIVE',
      details: { vehicleInfo: 'Rental sedan', startLocation: 'Sea-Tac Airport', endLocation: 'Pike Place Suites' },
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-train',
      tripId: TRIP_ID,
      title: 'Link light rail to the U-District',
      time: relativeEventTime({ day: 1, start: '08:15', end: '08:45' }),
      place: { name: 'Westlake Station', latitude: 47.6113, longitude: -122.3371 },
      transitType: 'TRAIN',
      details: { operator: 'Sound Transit', trainNumber: '1 Line', confirmationCode: null, departureStation: 'Westlake Station', arrivalStation: 'U District Station' },
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-scooter',
      tripId: TRIP_ID,
      title: 'Scooter to Kerry Park',
      time: relativeEventTime({ day: 1, start: '15:30', end: '16:00' }),
      place: { name: 'Kerry Park', latitude: 47.6295, longitude: -122.3599 },
      transitType: 'SCOOTER',
      details: { operator: 'Lime', startLocation: 'Pike Place Suites', endLocation: 'Kerry Park' },
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-walk',
      tripId: TRIP_ID,
      title: 'Walk the waterfront',
      time: relativeEventTime({ day: 2, start: '15:30', end: '16:10' }),
      place: { name: 'Seattle Waterfront', latitude: 47.6062, longitude: -122.3407 },
      transitType: 'WALK',
      details: { startLocation: null, endLocation: 'Seattle Waterfront' },
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-shuttle',
      tripId: TRIP_ID,
      title: 'Hotel shuttle to the airport',
      time: relativeEventTime({ day: 3, start: '09:00', end: '09:45' }),
      place: { name: 'Seattle-Tacoma International Airport', latitude: 47.4502, longitude: -122.3088 },
      transitType: 'OTHER',
      details: { customFields: { Provider: 'Hotel shuttle', 'Pickup spot': 'Front desk' } },
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-taylor-drive',
      tripId: TRIP_ID,
      title: 'Taylor drives in from Portland',
      time: relativeEventTime({ day: 0, start: '08:00', end: '11:30' }),
      place: { name: 'Pike Place Suites', latitude: 47.6088, longitude: -122.3402 },
      transitType: 'DRIVE',
      details: { vehicleInfo: 'Green Subaru', startLocation: 'Portland, OR', endLocation: 'Pike Place Suites' },
      attendees: [taylor.uid],
      stackLabel: 'Everyone arriving',
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-jamie-flight-1',
      tripId: TRIP_ID,
      title: 'Flight UA 301',
      time: relativeEventTime({ day: 0, start: '06:30', end: '07:50', timezone: 'America/Denver' }),
      place: { name: 'Denver International Airport', latitude: 39.8561, longitude: -104.6737 },
      transitType: 'FLIGHT',
      details: { airline: 'United Airlines', airlineIataCode: 'UA', airlineIcaoCode: 'UAL', flightNumber: 'UA 301', confirmationCode: 'JM4K2P', departureAirportCode: 'DEN', arrivalAirportCode: 'SLC' },
      attendees: [jamie.uid],
      groupLabel: 'Jamie flies in',
      stackLabel: 'Everyone arriving',
    },
    {
      collection: eventsCollection,
      id: 'seed-waypoint-jamie-flight-2',
      tripId: TRIP_ID,
      title: 'Flight UA 1190',
      time: relativeEventTime({ day: 0, start: '09:30', end: '11:10', timezone: 'America/Denver' }),
      place: { name: 'Salt Lake City International Airport', latitude: 40.7899, longitude: -111.9791 },
      transitType: 'FLIGHT',
      details: { airline: 'United Airlines', airlineIataCode: 'UA', airlineIcaoCode: 'UAL', flightNumber: 'UA 1190', confirmationCode: 'JM4K2P', departureAirportCode: 'SLC', arrivalAirportCode: 'SEA' },
      attendees: [jamie.uid],
      groupLabel: 'Jamie flies in',
      stackLabel: 'Everyone arriving',
    },
    {
      collection: activeEventsCollection,
      id: 'active-trip-drive',
      tripId: ACTIVE_TRIP_ID,
      title: 'Drive to Salt Creek',
      time: relativeEventTime({ day: 1, start: '08:15', end: '09:00' }),
      place: { name: 'Salt Creek Recreation Area', latitude: 48.1585, longitude: -123.6928 },
      transitType: 'DRIVE',
      details: { vehicleInfo: 'Rental SUV', startLocation: null, endLocation: 'Salt Creek Recreation Area' },
    },
    {
      collection: activeEventsCollection,
      id: 'active-trip-walk',
      tripId: ACTIVE_TRIP_ID,
      title: 'Walk down to the tide pools',
      time: relativeEventTime({ day: 1, start: '09:15', end: '09:55' }),
      place: { name: 'Tongue Point Trail', latitude: 48.1623, longitude: -123.7165 },
      transitType: 'WALK',
      details: { startLocation: 'Salt Creek parking lot', endLocation: 'Tongue Point Trail' },
    },
    {
      collection: activeEventsCollection,
      id: 'active-trip-bike',
      tripId: ACTIVE_TRIP_ID,
      title: 'Bike the Olympic Discovery Trail',
      time: relativeEventTime({ day: 2, start: '08:30', end: '10:00' }),
      place: { name: 'Olympic Discovery Trail', latitude: 48.1181, longitude: -123.4307 },
      transitType: 'BIKE',
      details: { operator: 'Peninsula Bike Rentals', startLocation: null, endLocation: 'Olympic Discovery Trail' },
    },
    {
      collection: activeEventsCollection,
      id: 'active-trip-shuttle',
      tripId: ACTIVE_TRIP_ID,
      title: 'Shuttle to Hurricane Ridge',
      time: relativeEventTime({ day: 3, start: '09:00', end: '09:45' }),
      place: { name: 'Hurricane Ridge Visitor Center', latitude: 47.9696, longitude: -123.4983 },
      transitType: 'OTHER',
      details: { customFields: { Provider: 'Park shuttle', Fare: '$12 each' } },
    },
    {
      collection: eveningTripRef.collection('events'),
      id: 'evening-drive',
      tripId: EVENING_TRIP_ID,
      title: 'Drive to La Conner',
      time: absoluteEventTime(context.now - 10 * HOUR_MS, context.now - 9 * HOUR_MS - 15 * 60_000, eveningTripStart),
      place: { name: 'La Conner', latitude: 48.3918, longitude: -122.4954 },
      transitType: 'DRIVE',
      details: { vehicleInfo: 'Blue hatchback', startLocation: null, endLocation: 'La Conner' },
    },
    {
      collection: eveningTripRef.collection('events'),
      id: 'evening-bike',
      tripId: EVENING_TRIP_ID,
      title: 'Bike back along the dike',
      time: absoluteEventTime(context.now - 4 * HOUR_MS, context.now - 3 * HOUR_MS - 15 * 60_000, eveningTripStart),
      place: { name: 'Fir Island Farm Reserve', latitude: 48.3329, longitude: -122.3835 },
      transitType: 'BIKE',
      details: { operator: null, startLocation: 'Roozengaarde', endLocation: 'Fir Island Farm Reserve' },
    },
    {
      collection: eveningTripRef.collection('events'),
      id: 'evening-ferry',
      tripId: EVENING_TRIP_ID,
      title: 'Ferry to Orcas Island',
      time: absoluteEventTime(startOfToday + DAY_MS + 13 * HOUR_MS, startOfToday + DAY_MS + 14 * HOUR_MS + 30 * 60_000, eveningTripStart),
      place: { name: 'Anacortes Ferry Terminal', latitude: 48.5019, longitude: -122.6792 },
      transitType: 'FERRY',
      details: { operator: 'Washington State Ferries', confirmationCode: 'WSF-20931', departurePort: 'Anacortes Ferry Terminal', arrivalPort: 'Orcas Island' },
    },
  ] as const;

  await Promise.all(
    travelEvents.map((travel) =>
      travel.collection.doc(travel.id).set({
        id: travel.id,
        tripId: travel.tripId,
        eventType: 'TRAVEL',
        ...travel.time,
        title: travel.title,
        locationName: travel.place.name,
        address: null,
        latitude: travel.place.latitude,
        longitude: travel.place.longitude,
        eventDetails: {
          transitType: travel.transitType,
          transitDetails: { notes: null, estimatedTravelTimeMs: null, ...travel.details },
        },
        notes: null,
        attendeeTargetType: 'attendees' in travel ? 'SPECIFIC_MEMBERS' : 'EVERYONE_INCLUDING_FUTURE',
        assignedMemberIds: 'attendees' in travel ? travel.attendees : [],
        venueOpenTime: null,
        venueCloseTime: null,
        changeHistory: [],
        place: null,
        linkUrl: null,
        linkPreview: null,
        linkKind: null,
        groupLabel: 'groupLabel' in travel ? travel.groupLabel : null,
        stackLabel: 'stackLabel' in travel ? travel.stackLabel : null,
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
      }),
    ),
  );

  const personalExpenses = [
    { id: 'seed-personal-souvenirs', title: 'Souvenirs for the kids', amount: 64.5, status: 'EXPECTED', category: 'SHOPPING', dayIndex: 2 },
    { id: 'seed-personal-coffee', title: 'Airport coffee', amount: 12, status: 'PAID', category: 'FOOD', dayIndex: 0 },
    { id: 'seed-personal-spa', title: 'Spa treatment', amount: 140, status: 'EXPECTED', category: 'ACTIVITIES', dayIndex: null },
  ];
  for (const personalExpense of personalExpenses) {
    await context.firestore
      .doc(`apps/waypoint/personalExpenses/${alex.uid}/items/${personalExpense.id}`)
      .set({
        ...personalExpense,
        tripId: TRIP_ID,
        currency: 'USD',
        customCategoryLabel: null,
        note: null,
        createdAt: context.now,
        lastEditedAt: context.now,
      });
  }

  const scaleDocuments = await seedWaypointScaleTrip({
    context,
    tripStart: activeTripStart,
    alexUid: alex.uid,
    taylorUid: taylor.uid,
    jamieUid: jamie.uid,
    timezone: TRIP_TIMEZONE,
  });

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 78 + personalExpenses.length + scaleDocuments,
  };
}
