import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import { gcmDecrypt } from '../../../appKeys/gcm.js';
import type {
  SourceAdapter,
  SourceCtx,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
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
    deepLink: () => '/worth-the-wait',
  };
}
