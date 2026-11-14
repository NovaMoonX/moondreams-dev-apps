import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import {
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { computeBalance, type ExpenseShape } from './balances.js';
import { WAYPOINT_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = WAYPOINT_SHARES.shares;
  if (!declared) throw new Error('Waypoint declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const DAY_MS = 86_400_000;
const TRIP_LIMIT = 100;
const DOC_LIMIT = 500;
// A plan may be dated this many days before the first day or after the last.
const DAYS_OUTSIDE_TRIP = 3;
const DETAIL_CHARS = 120;
const NAME_CHARS = 60;
const LISTED_NAMES = 3;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const EMPTY_RECORD: SharedRecord = {
  sourceRef: '',
  kind: 'event',
  title: '',
  subtitle: null,
  detail: null,
  startAt: null,
  endAt: null,
  isAllDay: false,
  dueAt: null,
  timeZone: null,
  placeLabel: null,
  amountCents: null,
  currency: null,
  sourceUpdatedAt: null,
  extra: {},
};

type RecordFields = Pick<SharedRecord, 'sourceRef' | 'kind' | 'title'> &
  Partial<SharedRecord>;

/** The only way a record leaves: exactly the contract's keys, nothing the source added. */
const toRecord = (fields: RecordFields): SharedRecord => {
  const full: SharedRecord = { ...EMPTY_RECORD, ...fields };
  return Object.fromEntries(
    SHARED_RECORD_KEYS.map((key) => [key, full[key]]),
  ) as unknown as SharedRecord;
};

const readText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const clip = (value: string, chars: number) =>
  value.length > chars ? `${value.slice(0, chars - 1)}…` : value;

const readIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

interface CategoryRead {
  records: SharedRecord[];
  isFull: boolean;
}

interface Trip {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  title: string;
  startDate: number;
  endDate: number;
  isRelative: boolean;
  zone: string | null;
  city: string | null;
  currency: string | null;
  updatedAt: number | null;
}

interface Moment {
  at: number;
  isAllDay: boolean;
  zone: string | null;
}

const TRIP_FIELDS = [
  'title',
  'startDate',
  'endDate',
  'timeModel',
  'timezone',
  'city.name',
  'defaultCurrency',
  'isArchived',
  'lastEditedAt',
];

const TRANSIT_LABELS: Record<string, string> = {
  FLIGHT: 'Flight',
  DRIVE: 'Drive',
  FERRY: 'Ferry',
  TRAIN: 'Train',
  WALK: 'Walk',
  BIKE: 'Bike ride',
  SCOOTER: 'Scooter ride',
};

const readDocs = async (query: FirebaseFirestore.Query) => {
  const snapshot = await query.limit(DOC_LIMIT).get();
  return { docs: snapshot.docs, isFull: snapshot.size < DOC_LIMIT };
};

/** Only the trips whose members hold the person, from the window on and not archived; a trip they left no longer lists them. */
async function readTrips(
  firestore: Firestore,
  uid: string,
  windowStart: number,
  extraFields: string[] = [],
) {
  const snapshot = await firestore
    .collection('apps/waypoint/trips')
    .where(`members.${uid}.uid`, '==', uid)
    .select(...TRIP_FIELDS, ...extraFields)
    .limit(TRIP_LIMIT)
    .get();
  const trips = snapshot.docs.flatMap((doc): Trip[] => {
    const title = readText(doc.get('title'));
    const startDate = readNumber(doc.get('startDate'));
    const endDate = readNumber(doc.get('endDate'));
    if (
      title === null ||
      startDate === null ||
      endDate === null ||
      doc.get('isArchived') === true ||
      endDate + DAY_MS < windowStart
    )
      return [];
    return [
      {
        id: doc.id,
        ref: doc.ref,
        title,
        startDate,
        endDate,
        isRelative: doc.get('timeModel') === 'RELATIVE',
        zone: readText(doc.get('timezone')),
        city: readText(doc.get('city.name')),
        currency: readText(doc.get('defaultCurrency')),
        updatedAt: readNumber(doc.get('lastEditedAt')),
      },
    ];
  });
  return { trips, docs: snapshot.docs, isFull: snapshot.size < TRIP_LIMIT };
}

const inEveryTrip = async (
  firestore: Firestore,
  uid: string,
  windowStart: number,
  read: (trip: Trip) => Promise<CategoryRead>,
): Promise<CategoryRead> => {
  const { trips, isFull } = await readTrips(firestore, uid, windowStart);
  const reads = await Promise.all(trips.map(read));
  return {
    records: reads.flatMap((one) => one.records),
    isFull: isFull && reads.every((one) => one.isFull),
  };
};

const isInTripRange = (trip: Trip, dayIndex: number) =>
  dayIndex >= -DAYS_OUTSIDE_TRIP &&
  dayIndex <
    Math.max(1, Math.floor((trip.endDate - trip.startDate) / DAY_MS) + 1) +
      DAYS_OUTSIDE_TRIP;

/** A trip day and floating clock time as an instant in the item's zone (else the trip's); with no time, or no zone to place it in, the day alone. */
const toMoment = (
  trip: Trip,
  dayIndex: number | null,
  time: string | null,
  zoneOverride: string | null,
): Moment | null => {
  if (dayIndex === null || !isInTripRange(trip, dayIndex)) return null;
  const dayStart = trip.startDate + dayIndex * DAY_MS;
  const zone = zoneOverride ?? trip.zone;
  const allDay = { at: dayStart, isAllDay: true, zone: null };
  if (time === null || !TIME_PATTERN.test(time) || zone === null) return allDay;
  try {
    const date = new Date(dayStart).toISOString().slice(0, 10);
    return {
      at: zonedDateTimeToEpoch(date, time, zone),
      isAllDay: false,
      zone,
    };
  } catch {
    return allDay;
  }
};

const toInstant = (value: unknown): Moment | null => {
  const at = readNumber(value);
  return at === null ? null : { at, isAllDay: false, zone: null };
};

interface Item {
  sourceRef: string;
  title: string;
  subtitle: string;
  start: Moment | null;
  end: Moment | null;
  placeLabel: string | null;
  detail?: string | null;
  updatedAt: number | null;
}

const toItemRecords = (item: Item, windowStart: number): SharedRecord[] => {
  const { start, end } = item;
  if (start === null) return [];
  const last = end?.at ?? (start.isAllDay ? start.at + DAY_MS : start.at);
  if (last < windowStart) return [];
  return [
    toRecord({
      sourceRef: item.sourceRef,
      kind: 'event',
      title: item.title,
      subtitle: item.subtitle,
      detail: item.detail ?? null,
      startAt: start.at,
      endAt:
        end !== null && end.isAllDay === start.isAllDay && end.at > start.at
          ? end.at
          : null,
      isAllDay: start.isAllDay,
      timeZone: start.zone,
      placeLabel: item.placeLabel,
      sourceUpdatedAt: item.updatedAt,
    }),
  ];
};

const readFlightDetail = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
  if (doc.get('eventDetails.transitType') !== 'FLIGHT') return null;
  const flight = [
    readText(doc.get('eventDetails.transitDetails.airline')),
    readText(doc.get('eventDetails.transitDetails.flightNumber')),
  ]
    .flatMap((part) => (part === null ? [] : [clip(part, NAME_CHARS)]))
    .join(' ');
  const from = readText(
    doc.get('eventDetails.transitDetails.departureAirportCode'),
  );
  const to = readText(
    doc.get('eventDetails.transitDetails.arrivalAirportCode'),
  );
  const route =
    from !== null && to !== null
      ? `${clip(from, 8)} → ${clip(to, 8)}`
      : from !== null
        ? `from ${clip(from, 8)}`
        : to !== null
          ? `to ${clip(to, 8)}`
          : '';
  const detail = [flight, route].filter((part) => part !== '').join(' · ');
  return detail === '' ? null : clip(detail, DETAIL_CHARS);
};

const readEventSubtitle = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
  const type = readText(doc.get('eventType'));
  if (type === 'TRAVEL')
    return (
      TRANSIT_LABELS[readText(doc.get('eventDetails.transitType')) ?? ''] ??
      'Travel'
    );
  if (type === 'DINING') return 'Dining';
  if (type === 'ACTIVITY') return 'Activity';
  return readText(doc.get('customTypeLabel')) ?? 'Plan';
};

async function readEvents(trip: Trip, uid: string) {
  const { docs, isFull } = await readDocs(
    trip.ref
      .collection('events')
      .select(
        'eventType',
        'customTypeLabel',
        'eventDetails.transitType',
        'eventDetails.transitDetails.airline',
        'eventDetails.transitDetails.flightNumber',
        'eventDetails.transitDetails.departureAirportCode',
        'eventDetails.transitDetails.arrivalAirportCode',
        'title',
        'dayIndex',
        'endDayIndex',
        'startAt',
        'endAt',
        'startTime',
        'endTime',
        'timezone',
        'endTimezone',
        'locationName',
        'attendeeTargetType',
        'assignedMemberIds',
        'isArchived',
        'lastEditedAt',
      ),
  );
  const items = docs.flatMap((doc): Item[] => {
    const title = readText(doc.get('title'));
    const isForPerson =
      doc.get('attendeeTargetType') === 'EVERYONE_INCLUDING_FUTURE' ||
      readIds(doc.get('assignedMemberIds')).includes(uid);
    if (
      title === null ||
      !isForPerson ||
      doc.get('isArchived') === true ||
      doc.get('eventType') === 'FREE_TIME'
    )
      return [];
    const zone = readText(doc.get('timezone'));
    const dayIndex = readNumber(doc.get('dayIndex'));
    const endDayIndex = readNumber(doc.get('endDayIndex'));
    return [
      {
        sourceRef: `trips/${trip.id}/events/${doc.id}`,
        title,
        subtitle: readEventSubtitle(doc),
        detail: readFlightDetail(doc),
        start: trip.isRelative
          ? toMoment(trip, dayIndex, readText(doc.get('startTime')), zone)
          : toInstant(doc.get('startAt')),
        end: trip.isRelative
          ? toMoment(
              trip,
              endDayIndex,
              readText(doc.get('endTime')),
              readText(doc.get('endTimezone')) ?? zone,
            )
          : toInstant(doc.get('endAt')),
        placeLabel: readText(doc.get('locationName')),
        updatedAt: readNumber(doc.get('lastEditedAt')),
      },
    ];
  });
  return { items, isFull };
}

async function readStays(trip: Trip) {
  const { docs, isFull } = await readDocs(
    trip.ref
      .collection('stays')
      .select(
        'name',
        'address',
        'checkInAt',
        'checkOutAt',
        'checkInTimezone',
        'checkInDayIndex',
        'checkInTime',
        'checkOutDayIndex',
        'checkOutTime',
        'lastEditedAt',
      ),
  );
  const items = docs.flatMap((doc): Item[] => {
    const title = readText(doc.get('name'));
    if (title === null) return [];
    const zone = readText(doc.get('checkInTimezone'));
    return [
      {
        sourceRef: `trips/${trip.id}/stays/${doc.id}`,
        title,
        subtitle: 'Stay',
        start: trip.isRelative
          ? toMoment(
              trip,
              readNumber(doc.get('checkInDayIndex')),
              readText(doc.get('checkInTime')),
              zone,
            )
          : toInstant(doc.get('checkInAt')),
        end: trip.isRelative
          ? toMoment(
              trip,
              readNumber(doc.get('checkOutDayIndex')),
              readText(doc.get('checkOutTime')),
              zone,
            )
          : toInstant(doc.get('checkOutAt')),
        placeLabel: readText(doc.get('address')),
        updatedAt: readNumber(doc.get('lastEditedAt')),
      },
    ];
  });
  return { items, isFull };
}

async function readRentals(trip: Trip) {
  const { docs, isFull } = await readDocs(
    trip.ref
      .collection('rentals')
      .select(
        'name',
        'pickupAddress',
        'pickupDayIndex',
        'pickupTime',
        'returnDayIndex',
        'returnTime',
        'timezone',
        'lastEditedAt',
      ),
  );
  const items = docs.flatMap((doc): Item[] => {
    const title = readText(doc.get('name'));
    if (title === null) return [];
    const zone = readText(doc.get('timezone'));
    return [
      {
        sourceRef: `trips/${trip.id}/rentals/${doc.id}`,
        title,
        subtitle: 'Rental car',
        start: toMoment(
          trip,
          readNumber(doc.get('pickupDayIndex')),
          readText(doc.get('pickupTime')),
          zone,
        ),
        end: toMoment(
          trip,
          readNumber(doc.get('returnDayIndex')),
          readText(doc.get('returnTime')),
          zone,
        ),
        placeLabel: readText(doc.get('pickupAddress')),
        updatedAt: readNumber(doc.get('lastEditedAt')),
      },
    ];
  });
  return { items, isFull };
}

const syncTrips = async (
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> => {
  const { trips, isFull } = await readTrips(firestore, uid, windowStart);
  return {
    records: trips.map((trip) =>
      toRecord({
        sourceRef: `trips/${trip.id}`,
        kind: 'trip',
        title: trip.title,
        startAt: trip.startDate,
        endAt: trip.endDate,
        isAllDay: true,
        timeZone: trip.zone,
        placeLabel: trip.city,
        sourceUpdatedAt: trip.updatedAt,
      }),
    ),
    isFull,
  };
};

const syncItinerary = (
  firestore: Firestore,
  uid: string,
  windowStart: number,
) =>
  inEveryTrip(firestore, uid, windowStart, async (trip) => {
    const [events, stays, rentals] = await Promise.all([
      readEvents(trip, uid),
      readStays(trip),
      readRentals(trip),
    ]);
    return {
      records: [...events.items, ...stays.items, ...rentals.items].flatMap(
        (item) => toItemRecords(item, windowStart),
      ),
      isFull: events.isFull && stays.isFull && rentals.isFull,
    };
  });

const toTaskRecord = (
  trip: Trip,
  sourceRef: string,
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): SharedRecord[] => {
  const title = readText(doc.get('title'));
  if (title === null || doc.get('isCompleted') === true) return [];
  const dueDay = readNumber(doc.get('completeByDayIndex'));
  return [
    toRecord({
      sourceRef,
      kind: 'task',
      title,
      subtitle: trip.title,
      dueAt: dueDay === null ? null : trip.startDate + dueDay * DAY_MS,
      isAllDay: dueDay !== null,
      sourceUpdatedAt: readNumber(doc.get('lastEditedAt')),
    }),
  ];
};

const TASK_FIELDS = [
  'title',
  'isCompleted',
  'completeByDayIndex',
  'lastEditedAt',
];

/** Tasks assigned to the person on trips they are in, and their own private ones; no one else's private task is ever read. */
const syncTasks = async (
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> => {
  const { trips, isFull } = await readTrips(firestore, uid, windowStart);
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const [assigned, privateRead] = await Promise.all([
    Promise.all(
      trips.map(async (trip) => {
        const read = await readDocs(
          trip.ref
            .collection('checklist')
            .where('assignedToUids', 'array-contains', uid)
            .select(...TASK_FIELDS),
        );
        return {
          isFull: read.isFull,
          records: read.docs.flatMap((doc) =>
            toTaskRecord(trip, `trips/${trip.id}/checklist/${doc.id}`, doc),
          ),
        };
      }),
    ),
    readDocs(
      firestore
        .collection(`apps/waypoint/personalChecklist/${uid}/items`)
        .select('tripId', ...TASK_FIELDS),
    ),
  ]);
  const own = privateRead.docs.flatMap((doc) => {
    const trip = tripsById.get(readText(doc.get('tripId')) ?? '');
    return trip === undefined
      ? []
      : toTaskRecord(trip, `trips/${trip.id}/personalChecklist/${doc.id}`, doc);
  });
  return {
    records: [...assigned.flatMap((one) => one.records), ...own],
    isFull: isFull && privateRead.isFull && assigned.every((one) => one.isFull),
  };
};

const CHECKLIST_FIELDS = [
  'title',
  'category',
  'customCategoryLabel',
  'isCompleted',
  'lastEditedAt',
];

const CHECKLIST_LABELS: Record<string, string> = {
  DOCUMENTS: 'Documents',
  PACKING: 'Packing',
  BOOKINGS: 'Bookings',
  LOGISTICS: 'Logistics',
};

interface ChecklistLine {
  tripId: string;
  group: string;
  title: string;
  isDone: boolean;
  updatedAt: number | null;
}

const toChecklistLine = (
  tripId: string,
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): ChecklistLine[] => {
  const title = readText(doc.get('title'));
  if (title === null) return [];
  const category = readText(doc.get('category')) ?? 'OTHER';
  const custom = readText(doc.get('customCategoryLabel'));
  return [
    {
      tripId,
      group: clip(
        category === 'OTHER'
          ? (custom ?? 'Other')
          : (CHECKLIST_LABELS[category] ?? 'Other'),
        NAME_CHARS,
      ),
      title: clip(title, NAME_CHARS),
      isDone: doc.get('isCompleted') === true,
      updatedAt: readNumber(doc.get('lastEditedAt')),
    },
  ];
};

const toChecklistRecord = (
  trip: Trip,
  group: string,
  lines: ChecklistLine[],
) => {
  const names = (isDone: boolean) =>
    lines
      .filter((line) => line.isDone === isDone)
      .map((line) => line.title)
      .sort();
  const todo = names(false);
  const done = names(true);
  const listed = (label: string, titles: string[]) =>
    titles.length === 0
      ? null
      : `${label}: ${titles.slice(0, LISTED_NAMES).join(', ')}${titles.length > LISTED_NAMES ? ` and ${titles.length - LISTED_NAMES} more` : ''}`;
  const detail = [listed('To do', todo), listed('Done', done)]
    .flatMap((part) => (part === null ? [] : [part]))
    .join('. ');
  return toRecord({
    sourceRef: `trips/${trip.id}/checklist/${encodeURIComponent(group)}`,
    kind: 'countSummary',
    title: `${clip(trip.title, NAME_CHARS)}: ${group}`,
    subtitle: `${done.length} of ${lines.length} done`,
    detail: clip(detail, DETAIL_CHARS),
    sourceUpdatedAt: lines.reduce<number | null>(
      (latest, line) =>
        line.updatedAt === null
          ? latest
          : Math.max(latest ?? 0, line.updatedAt),
      null,
    ),
    extra: { items: lines.length },
  });
};

const syncChecklist = async (
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> => {
  const { trips, isFull } = await readTrips(firestore, uid, windowStart);
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const [assigned, privateRead] = await Promise.all([
    Promise.all(
      trips.map(async (trip) => {
        const read = await readDocs(
          trip.ref
            .collection('checklist')
            .where('assignedToUids', 'array-contains', uid)
            .select(...CHECKLIST_FIELDS),
        );
        return {
          isFull: read.isFull,
          lines: read.docs.flatMap((doc) => toChecklistLine(trip.id, doc)),
        };
      }),
    ),
    readDocs(
      firestore
        .collection(`apps/waypoint/personalChecklist/${uid}/items`)
        .select('tripId', ...CHECKLIST_FIELDS),
    ),
  ]);
  const own = privateRead.docs.flatMap((doc) => {
    const tripId = readText(doc.get('tripId')) ?? '';
    return tripsById.has(tripId) ? toChecklistLine(tripId, doc) : [];
  });
  const groups = [...assigned.flatMap((one) => one.lines), ...own].reduce(
    (found, line) =>
      found.set(`${line.tripId}\n${line.group}`, [
        ...(found.get(`${line.tripId}\n${line.group}`) ?? []),
        line,
      ]),
    new Map<string, ChecklistLine[]>(),
  );
  return {
    records: [...groups.values()].flatMap((lines) => {
      const trip = tripsById.get(lines[0].tripId);
      return trip === undefined
        ? []
        : [toChecklistRecord(trip, lines[0].group, lines)];
    }),
    isFull: isFull && privateRead.isFull && assigned.every((one) => one.isFull),
  };
};

const readExpense = (
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): ExpenseShape => {
  const status = doc.get('status') === 'PAID' ? 'PAID' : 'EXPECTED';
  const record = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const splitEntries = Object.entries(record(doc.get('splitAmounts'))).flatMap(
    ([uid, amount]) => {
      const value = readNumber(amount);
      return value === null ? [] : [[uid, value] as const];
    },
  );
  return {
    status,
    payerUid: readText(doc.get('payerUid')),
    amount: readNumber(doc.get('amount')),
    amountMin: readNumber(doc.get('amountMin')),
    amountMax: readNumber(doc.get('amountMax')),
    paidAmount: readNumber(doc.get('paidAmount')),
    isPerPerson: doc.get('isPerPerson') === true,
    targetType: readText(doc.get('targetType')) ?? 'SPECIFIC_MEMBERS',
    targetMemberIds: readIds(doc.get('targetMemberIds')),
    splitAmounts:
      doc.get('splitAmounts') == null ? null : Object.fromEntries(splitEntries),
    repaidUids: Object.entries(record(doc.get('paidMemberStatus'))).flatMap(
      ([uid, mark]) => (record(mark).isPaid === true ? [uid] : []),
    ),
    earlyPayments: Object.fromEntries(
      Object.entries(record(doc.get('earlyPayments'))).flatMap(
        ([uid, payment]) => {
          const { toUid, amount, isReturned } = record(payment);
          return typeof toUid === 'string' && readNumber(amount) !== null
            ? [
                [
                  uid,
                  {
                    toUid,
                    amount: readNumber(amount) ?? 0,
                    isReturned: isReturned === true,
                  },
                ],
              ]
            : [];
        },
      ),
    ),
  };
};

const formatAmount = (cents: number, currency: string | null) =>
  `${(cents / 100).toFixed(2)}${currency === null ? '' : ` ${currency}`}`;

const readSubtitle = (oweCents: number, owedCents: number) => {
  if (oweCents > 0 && owedCents > 0) return 'You owe and are owed';
  return oweCents > 0 ? 'You owe' : "You're owed";
};

/** Only the money fields of a trip's expenses are read, never a title, note, link or receipt. */
const syncBalances = async (
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> => {
  const { trips, docs, isFull } = await readTrips(firestore, uid, windowStart, [
    'members',
  ]);
  const membersByTrip = new Map(
    docs.map((doc) => [
      doc.id,
      Object.keys((doc.get('members') as Record<string, unknown>) ?? {}),
    ]),
  );
  const reads = await Promise.all(
    trips.map(async (trip) => {
      const read = await readDocs(
        trip.ref
          .collection('expenses')
          .select(
            'status',
            'payerUid',
            'amount',
            'amountMin',
            'amountMax',
            'paidAmount',
            'isPerPerson',
            'targetType',
            'targetMemberIds',
            'splitAmounts',
            'paidMemberStatus',
            'earlyPayments',
          ),
      );
      const { oweCents, owedCents } = computeBalance(
        read.docs.map(readExpense),
        membersByTrip.get(trip.id) ?? [],
        uid,
      );
      return {
        isFull: read.isFull,
        records:
          oweCents === 0 && owedCents === 0
            ? []
            : [
                toRecord({
                  sourceRef: `trips/${trip.id}/balance`,
                  kind: 'moneySummary',
                  title: trip.title,
                  subtitle: readSubtitle(oweCents, owedCents),
                  detail: `You owe ${formatAmount(oweCents, trip.currency)}; you are owed ${formatAmount(owedCents, trip.currency)}`,
                  amountCents: owedCents - oweCents,
                  currency: trip.currency,
                  sourceUpdatedAt: trip.updatedAt,
                }),
              ],
      };
    }),
  );
  return {
    records: reads.flatMap((one) => one.records),
    isFull: isFull && reads.every((one) => one.isFull),
  };
};

export interface WaypointAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
}

const defaultDeps: WaypointAdapterDeps = {
  firestore: () => getFirestore(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'waypoint', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
};

export function createWaypointAdapter(
  deps: WaypointAdapterDeps = defaultDeps,
): SourceAdapter {
  const readCategory = (uid: string, req: SyncPageRequest) => {
    const firestore = deps.firestore();
    switch (req.category) {
      case 'trips':
        return syncTrips(firestore, uid, req.windowStart);
      case 'itinerary':
        return syncItinerary(firestore, uid, req.windowStart);
      case 'myTasks':
        return syncTasks(firestore, uid, req.windowStart);
      case 'tripChecklist':
        return syncChecklist(firestore, uid, req.windowStart);
      case 'tripBalances':
        return syncBalances(firestore, uid, req.windowStart);
      default:
        throw new Error('Unknown category.');
    }
  };

  return {
    manifest,
    status: async (ctx: SourceCtx) =>
      (await deps.canOpen(ctx.uid)) ? 'ok' : 'noAccess',
    syncPage: async (ctx, req): Promise<SyncPageResult> => ({
      ...(await readCategory(ctx.uid, req)),
      deletedRefs: [],
      cursor: null,
      isDone: true,
      resumeState: null,
    }),
    deepLink: (ref) => {
      const tripId = /^trips\/([^/]+)/.exec(ref)?.[1];
      return tripId === undefined
        ? '/waypoint'
        : `/waypoint?trip=${encodeURIComponent(tripId)}`;
    },
  };
}
