import type { Firestore } from 'firebase-admin/firestore';

import type { SeedContext } from './types.ts';

const DAY_MS = 86_400_000;
const TRIP_ID = 'seed-waypoint-trip-scale';
const INVITE_CODE = 'BIGGROUP';
const TRIP_DAYS = 14;
const GUEST_COUNT = 117;

const FIRST_NAMES = ['Ava', 'Ben', 'Chloe', 'Dmitri', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isla', 'Jonas', 'Kira', 'Liam', 'Maya', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wen', 'Xavier', 'Yara', 'Zane'];
const LAST_NAMES = ['Martinez', 'Okafor', 'Nguyen', 'Ivanov', 'Rossi', 'Haddad', 'Kim', 'Tanaka', 'Murphy', 'Weber', 'Patel', 'Oconnor', 'Singh', 'Cohen', 'Brandt', 'Raman', 'Foster', 'Alvarez', 'Whitaker', 'Lindqvist'];
const CHECKLIST_CATEGORIES = ['DOCUMENTS', 'PACKING', 'BOOKINGS', 'LOGISTICS', 'OTHER'] as const;
const EXPENSE_CATEGORIES = ['FOOD', 'TRANSPORT', 'LODGING', 'ACTIVITIES', 'SHOPPING'] as const;
const CUISINES = ['Ramen', 'Tacos', 'Seafood', 'Pizza', 'Thai', 'Brunch', 'BBQ', 'Dim sum'];
const PLACES = ['Pike Place Market', 'Discovery Park', 'Gas Works Park', 'Chihuly Garden', 'Kerry Park', 'Ballard Locks', 'Green Lake', 'Alki Beach', 'Space Needle', 'Museum of Pop Culture'];
const pad = (value: number) => String(value).padStart(2, '0');

interface ScaleInput {
  context: SeedContext;
  tripStart: number;
  alexUid: string;
  taylorUid: string;
  jamieUid: string;
  timezone: string;
}

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

async function writeAll(firestore: Firestore, writes: { path: string; data: Record<string, unknown> }[]) {
  for (const group of chunk(writes, 400)) {
    const batch = firestore.batch();
    group.forEach(({ path, data }) => batch.set(firestore.doc(path), data));
    await batch.commit();
  }
}

/** Seeds a deliberately oversized trip (120 members, a live timeline, 150 expenses) for scale checks; returns the documents written. Emulators only. */
export async function seedWaypointScaleTrip({ context, tripStart, alexUid, taylorUid, jamieUid, timezone }: ScaleInput) {
  const firestore = context.firestore;
  const joinedAt = context.now - DAY_MS;
  const tripPath = `apps/waypoint/trips/${TRIP_ID}`;
  const guests = Array.from({ length: GUEST_COUNT }, (_, index) => {
    const uid = `seed-scale-guest-${index}`;
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[(index * 7) % LAST_NAMES.length];
    return { uid, displayName: `${first} ${last}`, email: `${first}.${last}.${index}@example.test`.toLowerCase() };
  });
  const memberUids = [alexUid, taylorUid, jamieUid, ...guests.map((guest) => guest.uid)];
  const roles = ['EDITOR', 'EDITOR', 'COMMENTER', 'VIEWER'] as const;
  const members = Object.fromEntries(
    memberUids.map((uid, index) => [
      uid,
      {
        uid,
        role: uid === alexUid ? 'ADMIN' : uid === taylorUid ? 'EDITOR' : uid === jamieUid ? 'COMMENTER' : roles[index % roles.length],
        joinedAt,
      },
    ]),
  );
  const pickMember = (index: number) => memberUids[index % memberUids.length];

  const writes: { path: string; data: Record<string, unknown> }[] = [];
  const add = (path: string, data: Record<string, unknown>) => writes.push({ path, data });

  guests.forEach((guest) => add(`users/${guest.uid}`, { uid: guest.uid, email: guest.email, displayName: guest.displayName, photoURL: '', isAdmin: false }));

  add(tripPath, {
    id: TRIP_ID,
    title: 'Big Group Reunion (scale test)',
    coverImageUrl: null,
    startDate: tripStart,
    endDate: tripStart + (TRIP_DAYS - 1) * DAY_MS,
    timeModel: 'RELATIVE',
    timezone,
    defaultCurrency: null,
    isArchived: false,
    members,
    inviteCode: INVITE_CODE,
    sharedAlbumUrl: null,
    sharedAlbumSetByUid: null,
    sharedAlbumSetAt: null,
    city: null,
    noExpenseKeys: [],
    dateShiftStatus: null,
    createdBy: alexUid,
    createdAt: joinedAt,
    lastEditedAt: context.now,
  });
  add(`apps/waypoint/inviteCodes/${INVITE_CODE}`, { tripId: TRIP_ID, title: 'Big Group Reunion (scale test)' });

  const base = { tripId: TRIP_ID, createdBy: alexUid, createdAt: joinedAt, lastEditedAt: context.now };

  Array.from({ length: TRIP_DAYS * 12 }, (_, index) => index).forEach((index) => {
    const day = Math.floor(index / 12);
    const slot = index % 12;
    const minutes = 7 * 60 + slot * 75;
    const start = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    const end = `${pad(Math.floor((minutes + 60) / 60) % 24)}:${pad((minutes + 60) % 60)}`;
    const kind = ['DINING', 'ACTIVITY', 'TRAVEL', 'FREE_TIME'][slot % 4];
    const id = `scale-event-${index}`;
    const place = PLACES[index % PLACES.length];
    const stack = kind === 'TRAVEL' && slot < 4 ? `Arrivals day ${day + 1}` : null;
    add(`${tripPath}/events/${id}`, {
      ...base,
      id,
      eventType: kind,
      dayIndex: day,
      endDayIndex: day,
      startAt: null,
      endAt: null,
      startTime: start,
      endTime: end,
      timezone: null,
      endTimezone: null,
      title: kind === 'DINING' ? `${CUISINES[index % CUISINES.length]} near ${place}` : kind === 'TRAVEL' ? `Shuttle ${index} to ${place}` : `${place} visit`,
      locationName: place,
      address: 'Seattle, WA',
      latitude: 47.6 + (index % 10) / 100,
      longitude: -122.33 - (index % 10) / 100,
      eventDetails:
        kind === 'DINING'
          ? { mealType: 'LUNCH', cuisines: [CUISINES[index % CUISINES.length]] }
          : kind === 'TRAVEL'
            ? { transitType: 'DRIVE', transitDetails: { startLocation: null, endLocation: null, notes: null, estimatedTravelTimeMs: null } }
            : kind === 'ACTIVITY'
              ? { settings: ['OUTDOOR'] }
              : {},
      notes: index % 5 === 0 ? 'Meet at the front entrance. Bring a layer.' : null,
      attendeeTargetType: index % 3 === 0 ? 'SPECIFIC_MEMBERS' : 'EVERYONE_CURRENT',
      assignedMemberIds: index % 3 === 0 ? memberUids.filter((_, memberIndex) => memberIndex % 4 === index % 4) : memberUids,
      venueOpenTime: null,
      venueCloseTime: null,
      arriveByTime: null,
      arriveByNote: null,
      changeHistory: [],
      place: null,
      linkUrl: null,
      linkPreview: null,
      linkKind: null,
      groupLabel: stack,
      stackLabel: stack,
      reminderMinutesBefore: 20,
      reminderEnabled: false,
      reminderId: null,
      isArchived: false,
      archivedBy: null,
      archivedAt: null,
      seenBy: {},
    });
  });

  Array.from({ length: 60 }, (_, index) => index).forEach((index) => {
    const checkIn = index % (TRIP_DAYS - 2);
    const id = `scale-stay-${index}`;
    add(`${tripPath}/stays/${id}`, {
      ...base,
      id,
      name: `${['Lakeside', 'Harbor', 'Summit', 'Cedar', 'Willow'][index % 5]} ${['Lodge', 'Suites', 'Inn', 'Cabin'][index % 4]} ${index + 1}`,
      stayType: ['HOTEL', 'RENTAL', 'FRIEND_FAMILY', 'OTHER'][index % 4],
      address: `${100 + index} Evergreen Way, Seattle, WA`,
      latitude: 47.6 + (index % 20) / 100,
      longitude: -122.3 - (index % 20) / 100,
      checkInAt: null,
      checkOutAt: null,
      plannedArrivalAt: null,
      plannedDepartureAt: null,
      checkInDayIndex: checkIn,
      checkInTime: '15:00',
      checkOutDayIndex: checkIn + 2,
      checkOutTime: '11:00',
      plannedArrivalDayIndex: checkIn,
      plannedArrivalTime: '15:00',
      plannedDepartureDayIndex: checkIn + 2,
      plannedDepartureTime: '11:00',
      checkInTimezone: null,
      confirmationCode: index % 2 === 0 ? `SC-${1000 + index}` : null,
      notes: index % 3 === 0 ? 'Late check-in is fine. Text the host from the lobby.' : null,
      place: null,
      linkUrl: null,
      linkPreview: null,
      changeHistory: [],
      seenBy: {},
    });
  });

  Array.from({ length: 30 }, (_, index) => index).forEach((index) => {
    const id = `scale-rental-${index}`;
    const pickup = index % (TRIP_DAYS - 3);
    add(`${tripPath}/rentals/${id}`, {
      ...base,
      id,
      rentalType: 'CAR',
      name: ['Hertz', 'Avis', 'Enterprise', 'Budget', 'Sixt'][index % 5],
      vehicle: ['Toyota RAV4 or similar', 'Ford Transit van', 'Honda Odyssey'][index % 3],
      pickupAddress: 'Seattle-Tacoma International Airport Rental Car Facility, SeaTac, WA',
      pickupLatitude: 47.4436,
      pickupLongitude: -122.3009,
      pickupPlace: null,
      returnAddress: null,
      returnLatitude: null,
      returnLongitude: null,
      returnPlace: null,
      pickupDayIndex: pickup,
      pickupTime: '10:00',
      returnDayIndex: pickup + 3,
      returnTime: '16:00',
      timezone: null,
      confirmationCode: `R-${7000 + index}`,
      notes: null,
      linkUrl: null,
      linkPreview: null,
    });
  });

  Array.from({ length: 250 }, (_, index) => index).forEach((index) => {
    const id = `scale-check-${index}`;
    const isCompleted = index % 4 === 0;
    add(`${tripPath}/checklist/${id}`, {
      ...base,
      id,
      title: `${['Confirm', 'Pack', 'Book', 'Print', 'Email'][index % 5]} ${['passports', 'rain jackets', 'group dinner', 'tickets', 'shuttle times', 'snacks', 'chargers'][index % 7]} (${index + 1})`,
      category: CHECKLIST_CATEGORIES[index % CHECKLIST_CATEGORIES.length],
      customCategoryLabel: null,
      note: index % 6 === 0 ? 'Double-check with the group before the trip starts.' : null,
      completeByDayIndex: index % TRIP_DAYS,
      assignedToUids: [pickMember(index), pickMember(index + 3)],
      isCompleted,
      markedCompletedByUid: isCompleted ? alexUid : null,
      markedCompletedAt: isCompleted ? context.now - 1_800_000 : null,
    });
  });

  Array.from({ length: 60 }, (_, index) => index).forEach((index) => {
    const id = `scale-idea-${index}`;
    const isRestaurant = index % 2 === 0;
    add(`${tripPath}/ideas/${id}`, {
      id,
      tripId: TRIP_ID,
      ideaType: isRestaurant ? 'RESTAURANT' : 'ACTIVITY',
      title: isRestaurant ? `${CUISINES[index % CUISINES.length]} at ${PLACES[index % PLACES.length]}` : `${PLACES[index % PLACES.length]} walk`,
      linkUrl: null,
      notes: null,
      ideaDetails: isRestaurant
        ? { cuisines: [CUISINES[index % CUISINES.length]], suggestedDays: [index % TRIP_DAYS], suggestedTimeBlocks: ['EVENING'] }
        : { settings: ['OUTDOOR'], suggestedDays: [index % TRIP_DAYS], suggestedTimeBlocks: ['MORNING'] },
      addedByUid: pickMember(index),
      voterUids: memberUids.filter((_, memberIndex) => memberIndex % (index + 2) === 0),
      convertedToEntityId: null,
      createdAt: context.now - (index % 9) * DAY_MS,
      lastEditedAt: context.now - (index % 9) * DAY_MS,
    });
  });

  const paidStatus = Object.fromEntries(memberUids.map((uid) => [uid, { isPaid: false, paidAt: null }]));
  Array.from({ length: 150 }, (_, index) => index).forEach((index) => {
    const id = `scale-expense-${index}`;
    const isPaid = index % 3 !== 0;
    const isRange = !isPaid && index % 2 === 0;
    const isCustomSplit = isPaid && index % 5 === 1 && index % 7 !== 0;
    const amount = 40 + (index % 17) * 12;
    const splitUids = Array.from(new Set([alexUid, taylorUid, pickMember(index + 3), pickMember(index + 8)]));
    const firstCents = Math.round(amount * 40);
    const restCount = splitUids.length - 1;
    const baseRestCents = Math.floor((amount * 100 - firstCents) / restCount);
    const shareCents = splitUids.map((_, position) =>
      position === 0 ? firstCents : position === restCount ? amount * 100 - firstCents - baseRestCents * (restCount - 1) : baseRestCents,
    );
    add(`${tripPath}/expenses/${id}`, {
      id,
      tripId: TRIP_ID,
      dayIndex: index % TRIP_DAYS,
      title: `${['Dinner', 'Shuttle', 'Tickets', 'Groceries', 'Parking', 'Boat tour'][index % 6]} #${index + 1}`,
      amount: isRange ? null : amount,
      amountMin: isRange ? 100 : null,
      amountMax: isRange ? 180 : null,
      paidAmount: null,
      currency: 'USD',
      isPerPerson: index % 7 === 0,
      payerUid: isPaid ? (isCustomSplit ? alexUid : pickMember(index)) : null,
      status: isPaid ? 'PAID' : 'EXPECTED',
      category: EXPENSE_CATEGORIES[index % EXPENSE_CATEGORIES.length],
      customCategoryLabel: null,
      targetType: isCustomSplit ? 'SPECIFIC_MEMBERS' : 'EVERYONE_CURRENT',
      targetMemberIds: isCustomSplit ? splitUids : memberUids,
      splitAmounts: isCustomSplit ? Object.fromEntries(splitUids.map((uid, position) => [uid, shareCents[position] / 100])) : null,
      paidMemberStatus: paidStatus,
      earlyPayments: !isPaid && index % 6 === 0 ? { [taylorUid]: { toUid: alexUid, amount: 2, paidAt: context.now - 3_600_000, isReturned: false, returnedAt: null } } : {},
      note: null,
      groupLabel: index % 10 === 0 ? `Day ${(index % TRIP_DAYS) + 1} meals` : null,
      linkedTo: index % 4 === 0 ? { kind: 'EVENT', id: `scale-event-${index}` } : null,
      createdBy: alexUid,
      createdAt: joinedAt,
      lastEditedAt: context.now,
    });
  });

  Array.from({ length: 12 }).forEach((_, index) => {
    add(`apps/waypoint/personalExpenses/${alexUid}/items/scale-personal-${index}`, {
      id: `scale-personal-${index}`,
      tripId: TRIP_ID,
      dayIndex: index % TRIP_DAYS,
      title: `${['Souvenirs', 'Coffee run', 'Sunscreen', 'Taxi home'][index % 4]} #${index + 1}`,
      amount: 8 + (index % 5) * 9,
      currency: 'USD',
      status: index % 2 === 0 ? 'PAID' : 'EXPECTED',
      category: EXPENSE_CATEGORIES[index % EXPENSE_CATEGORIES.length],
      customCategoryLabel: null,
      note: null,
      createdAt: joinedAt,
      lastEditedAt: joinedAt,
    });
  });

  await writeAll(firestore, writes);

  return writes.length;
}
