import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { A_LIST_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = A_LIST_SHARES.shares;
  if (!declared) throw new Error('A-List declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const SHOWING_LIMIT = 500;
const THEATER_LIMIT = 100;

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

const readTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const membershipPath = (uid: string, collection: string) =>
  `apps/a-list/memberships/${uid}/${collection}`;

interface CategoryRead {
  records: SharedRecord[];
  isFull: boolean;
}

const readMovieTitle = (doc: FirebaseFirestore.DocumentSnapshot) =>
  readText(doc.get('movie.title'));

async function syncPlannedShowings(
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(membershipPath(uid, 'viewings'))
    .where('status', '==', 'PLANNED')
    .where('showtimeAt', '>=', windowStart)
    .orderBy('showtimeAt')
    .select(
      'movie.title',
      'showtimeAt',
      'endsAt',
      'theatre.name',
      'theatre.timeZone',
      'ticket.entryMode',
      'lastEditedAt',
    )
    .limit(SHOWING_LIMIT)
    .get();
  const records = snapshot.docs.flatMap((doc) => {
    const title = readMovieTitle(doc);
    const startAt = readTime(doc.get('showtimeAt'));
    if (title === null || startAt === null) return [];
    return [
      toRecord({
        sourceRef: `viewings/${doc.id}`,
        kind: 'event',
        title,
        startAt,
        endAt: readTime(doc.get('endsAt')),
        timeZone: readText(doc.get('theatre.timeZone')),
        placeLabel: readText(doc.get('theatre.name')),
        sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
        extra: { hasTicket: readText(doc.get('ticket.entryMode')) !== null },
      }),
    ];
  });
  return { records, isFull: snapshot.size < SHOWING_LIMIT };
}

const formatAddress = (doc: FirebaseFirestore.DocumentSnapshot) => {
  const region = [readText(doc.get('state')), readText(doc.get('postalCode'))]
    .filter((part): part is string => part !== null)
    .join(' ');
  const parts = [
    readText(doc.get('addressLine')),
    readText(doc.get('city')),
    region === '' ? null : region,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(', ');
};

async function syncSavedTheaters(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(membershipPath(uid, 'theatres'))
    .limit(THEATER_LIMIT)
    .get();
  const records = snapshot.docs.flatMap((doc) => {
    const title = readText(doc.get('name'));
    if (title === null) return [];
    return [
      toRecord({
        sourceRef: `theatres/${doc.id}`,
        kind: 'place',
        title,
        timeZone: readText(doc.get('timeZone')),
        sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
        extra: { address: formatAddress(doc) },
      }),
    ];
  });
  return { records, isFull: snapshot.size < THEATER_LIMIT };
}

const DAY_MS = 86_400_000;
const WATCHLIST_LIMIT = 200;
const FRIDAY = 5;

const PRIORITY_LABELS: Record<string, string> = {
  MUST_SEE: 'Must see',
  WANT_TO_SEE: 'Want to see',
  IF_I_HAVE_TIME: 'If I have time',
};

const toDayKey = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

/** A day in words for a record's detail, since a dated record that has ended leaves a reader's window. */
const toDayLine = (lead: string, at: number | null, timeZone: string) =>
  at === null
    ? null
    : `${lead} ${new Intl.DateTimeFormat('en-US', {
        timeZone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(at)}`;

const toUtcDayKey = (day: number) => new Date(day).toISOString().slice(0, 10);

const readZone = (value: unknown) => {
  const zone = readText(value);
  if (zone === null) return 'UTC';
  try {
    toDayKey(0, zone);
    return zone;
  } catch {
    return 'UTC';
  }
};

const toGoalLine = (
  label: string,
  goal: number | null,
  seen: number,
  period: string,
) => (goal === null ? null : `${label} goal ${goal}, ${seen} seen ${period}`);

/** Weeks run Friday to Thursday, like the app's counters; days are read in the zone of the latest theater, since the app does not store the person's own. */
async function readGoals(
  firestore: Firestore,
  uid: string,
  seenDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  now: number,
): Promise<SharedRecord[]> {
  const profile = await firestore.doc(`apps/a-list/memberships/${uid}`).get();
  const weeklyGoal = readTime(profile.get('weeklyGoal'));
  const monthlyGoal = readTime(profile.get('monthlyGoal'));
  if (weeklyGoal === null && monthlyGoal === null) return [];
  const zone = readZone(seenDocs[0]?.get('theatre.timeZone'));
  const today = toDayKey(now, zone);
  const todayDay = Date.parse(`${today}T00:00:00Z`);
  const sinceFriday = (new Date(todayDay).getUTCDay() - FRIDAY + 7) % 7;
  const weekStart = toUtcDayKey(todayDay - sinceFriday * DAY_MS);
  const weekEnd = toUtcDayKey(todayDay + (6 - sinceFriday) * DAY_MS);
  const seenKeys = seenDocs.flatMap((doc) => {
    const at = readTime(doc.get('showtimeAt'));
    return at === null ? [] : [toDayKey(at, zone)];
  });
  const lines = [
    toGoalLine(
      'Weekly',
      weeklyGoal,
      seenKeys.filter((key) => key >= weekStart && key <= weekEnd).length,
      'this week',
    ),
    toGoalLine(
      'Monthly',
      monthlyGoal,
      seenKeys.filter((key) => key.startsWith(today.slice(0, 7))).length,
      'this month',
    ),
  ].filter((line): line is string => line !== null);
  return [
    toRecord({
      sourceRef: 'goals',
      kind: 'knowledge',
      title: 'Movie goals',
      detail: lines.join(' · '),
      sourceUpdatedAt: readTime(profile.get('lastEditedAt')),
    }),
  ];
}

async function syncSeenMovies(
  firestore: Firestore,
  uid: string,
  now: number,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(membershipPath(uid, 'viewings'))
    .where('status', '==', 'SEEN')
    .orderBy('showtimeAt', 'desc')
    .select(
      'movie.title',
      'showtimeAt',
      'theatre.timeZone',
      'rating',
      'lastEditedAt',
    )
    .limit(SHOWING_LIMIT)
    .get();
  const seen = snapshot.docs.flatMap((doc) => {
    const title = readMovieTitle(doc);
    const rating = readTime(doc.get('rating'));
    if (title === null || rating === null) return [];
    return [
      toRecord({
        sourceRef: `viewings/${doc.id}`,
        kind: 'knowledge',
        title,
        detail: toDayLine(
          'Seen',
          readTime(doc.get('showtimeAt')),
          readZone(doc.get('theatre.timeZone')),
        ),
        sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
        extra: { rating },
      }),
    ];
  });
  const goals = await readGoals(firestore, uid, snapshot.docs, now);
  return {
    records: [...goals, ...seen],
    isFull: snapshot.size < SHOWING_LIMIT,
  };
}

/** Active movies not yet seen, the ones the app's Watchlist lists first. */
async function syncWatchlist(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const [snapshot, seenSnapshot] = await Promise.all([
    firestore
      .collection(membershipPath(uid, 'watchlist'))
      .select(
        'movie.title',
        'movie.releaseDate',
        'priority',
        'archivedAt',
        'lastEditedAt',
      )
      .limit(WATCHLIST_LIMIT)
      .get(),
    firestore
      .collection(membershipPath(uid, 'viewings'))
      .where('status', '==', 'SEEN')
      .select('movieKey')
      .limit(SHOWING_LIMIT)
      .get(),
  ]);
  const seenKeys = new Set(
    seenSnapshot.docs.map((doc) => readText(doc.get('movieKey'))),
  );
  const records = snapshot.docs.flatMap((doc) => {
    const title = readMovieTitle(doc);
    if (
      title === null ||
      readTime(doc.get('archivedAt')) !== null ||
      seenKeys.has(doc.id)
    )
      return [];
    const releaseDate = readTime(doc.get('movie.releaseDate'));
    return [
      toRecord({
        sourceRef: `watchlist/${doc.id}`,
        kind: 'artifact',
        title,
        detail: toDayLine('Out', releaseDate, 'UTC'),
        sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
        extra: {
          status: PRIORITY_LABELS[readText(doc.get('priority')) ?? ''] ?? null,
        },
      }),
    ];
  });
  return { records, isFull: snapshot.size < WATCHLIST_LIMIT };
}

export interface AListAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
  now: () => number;
}

const defaultDeps: AListAdapterDeps = {
  firestore: () => getFirestore(),
  now: () => Date.now(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'a-list', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
};

export function createAListAdapter(
  deps: AListAdapterDeps = defaultDeps,
): SourceAdapter {
  const readCategory = (uid: string, req: SyncPageRequest) => {
    const firestore = deps.firestore();
    switch (req.category) {
      case 'plannedShowings':
        return syncPlannedShowings(firestore, uid, req.windowStart);
      case 'savedTheaters':
        return syncSavedTheaters(firestore, uid);
      case 'seenMovies':
        return syncSeenMovies(firestore, uid, deps.now());
      case 'watchlist':
        return syncWatchlist(firestore, uid);
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
      const [collection, id] = ref.split('/');
      return collection === 'viewings' && id
        ? `/a-list?viewing=${encodeURIComponent(id)}`
        : '/a-list';
    },
  };
}
