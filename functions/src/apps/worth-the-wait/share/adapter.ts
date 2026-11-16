import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import { gcmDecrypt } from '../../../appKeys/gcm.js';
import type {
  LiveQueryArgs,
  LiveQueryResult,
  SourceAdapter,
  SourceCtx,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
  MAX_RECORDS_PER_CATEGORY,
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { WORTH_THE_WAIT_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = WORTH_THE_WAIT_SHARES.shares;
  if (!declared) throw new Error('Worth the Wait declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const SPACE_LIMIT = 50;
const BOX_LIMIT = 50;
const KEY_HEX_LENGTH = 64;

const EMPTY_RECORD: SharedRecord = {
  sourceRef: '',
  kind: 'countSummary',
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

const readSpaceKey = (value: unknown) => {
  const key =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>).key
      : null;
  return typeof key === 'string' && key.trim().length === KEY_HEX_LENGTH
    ? Buffer.from(key.trim(), 'hex')
    : null;
};

/** Opens a sealed field as the app does: a plain string as it is, else base64 value and nonce with the tag appended and no extra data; null when it will not open. */
const openField = (value: unknown, key: Buffer | null) => {
  if (typeof value === 'string') return readText(value);
  if (key === null || typeof value !== 'object' || value === null) return null;
  const sealed = value as Record<string, unknown>;
  const body = sealed.value || sealed.ciphertext;
  if (
    typeof body !== 'string' ||
    typeof sealed.nonce !== 'string' ||
    sealed.algorithm !== 'AES-256-GCM'
  )
    return null;
  try {
    return readText(gcmDecrypt(key, body, sealed.nonce, null).toString('utf8'));
  } catch {
    return null;
  }
};

interface Space {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  key: Buffer | null;
}

/** Only the spaces the person is a member of, with just the key bundle selected: the invite code is never fetched. */
async function readSpaces(firestore: Firestore, uid: string) {
  const snapshot = await firestore
    .collection('apps/worth-the-wait/spaces')
    .where('members', 'array-contains', uid)
    .select('encryption')
    .limit(SPACE_LIMIT)
    .get();
  return {
    spaces: snapshot.docs.map((doc): Space => ({
      id: doc.id,
      ref: doc.ref,
      key: readSpaceKey(doc.get('encryption')),
    })),
    isFull: snapshot.size < SPACE_LIMIT,
  };
}

/** Two aggregation counts, so no item document is read. */
async function countItems(box: FirebaseFirestore.DocumentReference) {
  const items = box.collection('items');
  const [all, revealed] = await Promise.all([
    items.count().get(),
    items.where('isRevealed', '==', true).count().get(),
  ]);
  const total = all.data().count;
  const shown = revealed.data().count;
  return { items: total, revealed: shown, notYetRevealed: total - shown };
}

const countRevealsWaiting = (requests: unknown, uid: string) => {
  const userIds = (Array.isArray(requests) ? requests : []).map((request) =>
    typeof request === 'object' && request !== null
      ? (request as Record<string, unknown>).userId
      : null,
  );
  return userIds.includes(uid)
    ? 0
    : userIds.filter((id) => typeof id === 'string').length;
};

async function readBoxes(space: Space, uid: string) {
  const snapshot = await space.ref
    .collection('boxes')
    .select('name', 'emoji', 'description', 'revealRequestedBy')
    .limit(BOX_LIMIT)
    .get();
  const records = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const name = openField(doc.get('name'), space.key);
      if (name === null) return [];
      return [
        toRecord({
          sourceRef: `spaces/${space.id}/boxes/${doc.id}`,
          kind: 'countSummary',
          title: name,
          subtitle: openField(doc.get('emoji'), space.key),
          detail: openField(doc.get('description'), space.key),
          extra: {
            ...(await countItems(doc.ref)),
            revealsWaiting: countRevealsWaiting(
              doc.get('revealRequestedBy'),
              uid,
            ),
          },
        }),
      ];
    }),
  );
  // A box whose name will not open is kept as unknown, not gone, so its older copy stays.
  return {
    records: records.flat(),
    isFull:
      snapshot.size < BOX_LIMIT && records.every((record) => record.length > 0),
  };
}

const syncBoxCounts = async (firestore: Firestore, uid: string) => {
  const { spaces, isFull } = await readSpaces(firestore, uid);
  const reads = await Promise.all(spaces.map((space) => readBoxes(space, uid)));
  return {
    records: reads.flatMap((one) => one.records),
    isFull: isFull && reads.every((one) => one.isFull),
  };
};

const DETAIL_LIMIT = 120;
const DAY_MS = 86_400_000;

const clipTo = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;

const readDay = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T00:00:00Z`)
    : null;

const readArgs = (args: unknown) => {
  const given = (
    typeof args === 'object' && args !== null ? args : {}
  ) as LiveQueryArgs;
  return {
    text: readText(given.text)?.toLowerCase() ?? null,
    from: readDay(given.from),
    to: readDay(given.to),
  };
};

const formatDay = (at: number) =>
  new Date(at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const toDayText = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Only the items already revealed, opened one box at a time; an item still hidden is never fetched. */
async function queryRevealedItems(
  firestore: Firestore,
  uid: string,
  args: unknown,
): Promise<LiveQueryResult> {
  const { text, from, to } = readArgs(args);
  const { spaces } = await readSpaces(firestore, uid);
  const perSpace = await Promise.all(
    spaces.map(async (space) => {
      const boxes = await space.ref
        .collection('boxes')
        .select('name')
        .limit(BOX_LIMIT)
        .get();
      const perBox = await Promise.all(
        boxes.docs.map(async (box) => {
          const boxName = openField(box.get('name'), space.key);
          if (boxName === null) return [];
          const items = await box.ref
            .collection('items')
            .where('isRevealed', '==', true)
            .select('content', 'revealedAt')
            .limit(MAX_RECORDS_PER_CATEGORY + 1)
            .get();
          return items.docs.flatMap((item) => {
            const name = openField(item.get('content'), space.key);
            const at = item.get('revealedAt');
            if (name === null) return [];
            return [
              {
                ref: `spaces/${space.id}/boxes/${box.id}/items/${item.id}`,
                boxName,
                name,
                at: typeof at === 'number' ? at : null,
              },
            ];
          });
        }),
      );
      return perBox.flat();
    }),
  );
  const matched = perSpace
    .flat()
    .filter(
      (entry) =>
        (text === null ||
          entry.name.toLowerCase().includes(text) ||
          entry.boxName.toLowerCase().includes(text)) &&
        (from === null || (entry.at !== null && entry.at >= from)) &&
        (to === null || (entry.at !== null && entry.at < to + DAY_MS)),
    )
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const shown = matched.slice(0, MAX_RECORDS_PER_CATEGORY);
  return {
    records: shown.map((entry) =>
      toRecord({
        sourceRef: entry.ref,
        kind: 'knowledge',
        title: clipTo(entry.name, DETAIL_LIMIT),
        subtitle: entry.boxName,
        detail:
          entry.at === null
            ? null
            : clipTo(
                `${entry.boxName} · revealed ${formatDay(entry.at)}`,
                DETAIL_LIMIT,
              ),
        startAt: entry.at,
        isAllDay: false,
      }),
    ),
    matchedCount: matched.length,
    totalCents: null,
    currency: null,
    isPartial: matched.length > MAX_RECORDS_PER_CATEGORY,
    from: from === null ? null : toDayText(from),
    to: to === null ? null : toDayText(to),
  };
}

export interface WorthTheWaitAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
}

const defaultDeps: WorthTheWaitAdapterDeps = {
  firestore: () => getFirestore(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'worth-the-wait', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
};

export function createWorthTheWaitAdapter(
  deps: WorthTheWaitAdapterDeps = defaultDeps,
): SourceAdapter {
  return {
    manifest,
    status: async (ctx: SourceCtx) =>
      (await deps.canOpen(ctx.uid)) ? 'ok' : 'noAccess',
    syncPage: async (ctx, req): Promise<SyncPageResult> => {
      if (req.category !== 'boxCounts') throw new Error('Unknown category.');
      return {
        ...(await syncBoxCounts(deps.firestore(), ctx.uid)),
        deletedRefs: [],
        cursor: null,
        isDone: true,
        resumeState: null,
      };
    },
    query: async (ctx, req): Promise<LiveQueryResult> => {
      if (req.category !== 'revealedItems')
        throw new Error('Unknown category.');
      return queryRevealedItems(deps.firestore(), ctx.uid, req.args);
    },
    deepLink: () => '/worth-the-wait',
  };
}
