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
    .where('showtimeAt', '>=', windowStart)
    .orderBy('showtimeAt')
    .limit(SHOWING_LIMIT)
    .get();
  const records = snapshot.docs.flatMap((doc) => {
    const title = readMovieTitle(doc);
    const startAt = readTime(doc.get('showtimeAt'));
    if (doc.get('status') !== 'PLANNED' || title === null || startAt === null)
      return [];
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

async function syncSeenMovies(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(membershipPath(uid, 'viewings'))
    .where('status', '==', 'SEEN')
    .limit(SHOWING_LIMIT)
    .get();
  const records = snapshot.docs.flatMap((doc) => {
    const title = readMovieTitle(doc);
    const rating = readTime(doc.get('rating'));
    if (title === null || rating === null) return [];
    return [
      toRecord({
        sourceRef: `viewings/${doc.id}`,
        kind: 'knowledge',
        title,
        sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
        extra: { rating },
      }),
    ];
  });
  return { records, isFull: snapshot.size < SHOWING_LIMIT };
}

export interface AListAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
}

const defaultDeps: AListAdapterDeps = {
  firestore: () => getFirestore(),
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
        return syncSeenMovies(firestore, uid);
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
