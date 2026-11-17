import type {
  DocumentData,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase/firestore';

import { auth } from '@/lib/firebase/config';
import { store } from '@/store';
import { generateUuid } from '@/utils';
import { toFingerprint, toHeldWrite } from '@/utils/heldWrites';
import {
  projectRecordedWrites,
  runRecordedTransaction,
  type RecordedReads,
  type RecordedWrite,
} from '@/lib/firebase/recordedTransaction';
import { watchWriteLanded } from '@/lib/firebase/syncWatchdog';
import { createSealedReader, type SealedReader } from '@lib/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { openFact } from '@apps/helm/store/listeners/factListener';
import { openMedia } from '@apps/helm/store/listeners/mediaListener';
import { openNote } from '@apps/helm/store/listeners/noteListener';
import { openPlace } from '@apps/helm/store/listeners/placeListener';
import { openProcedure } from '@apps/helm/store/listeners/procedureListener';
import { openProject } from '@apps/helm/store/listeners/projectListener';
import { openRun } from '@apps/helm/store/listeners/runListener';
import { openStyle } from '@apps/helm/store/listeners/styleListener';
import { openTask } from '@apps/helm/store/listeners/taskListener';
import { openTopic } from '@apps/helm/store/listeners/topicListener';
import { openWho } from '@apps/helm/store/listeners/whoListener';
import {
  dropHelmWrites,
  holdHelmWrites,
  settleHelmWrites,
  type HelmHoldInput,
} from '@apps/helm/store/helmSlice';
import {
  HELM_HELD_KINDS,
  type HelmHeldItems,
  type HelmHeldKind,
} from '@apps/helm/utils/heldLists';

const COLLECTION_KINDS: Record<string, HelmHeldKind> = {
  tasks: 'tasks',
  facts: 'facts',
  who: 'who',
  places: 'places',
  projects: 'projects',
  notes: 'notes',
  topics: 'topics',
  procedures: 'procedures',
  procedureRuns: 'runs',
  media: 'media',
  style: 'style',
};

/** The kind and id of the person's own record in a collection a listener list reads; anything else is never held. */
const readTarget = (
  segments: string[],
  uid: string,
): { kind: HelmHeldKind; id: string } | null => {
  const [apps, helm, users, owner, collection, id, ...rest] = segments;
  if (apps !== 'apps' || helm !== 'helm' || users !== 'users') return null;
  if (owner !== uid || id === undefined || rest.length > 0) return null;
  const kind = COLLECTION_KINDS[collection];
  return kind === undefined ? null : { kind, id };
};

const UNSHOWABLE = Symbol('unshowable');

// Opening each record twice runs before the commit, so a bulk change (a merge of hundreds of records) is left to the listeners.
const HELD_RECORD_CAP = 60;

type Opened = HelmHeldItems[HelmHeldKind];

const OPENERS: {
  [K in HelmHeldKind]: (
    entry: QueryDocumentSnapshot,
    read: SealedReader,
  ) => Promise<HelmHeldItems[K] | HelmHeldItems[K][] | null>;
} = {
  tasks: openTask,
  facts: openFact,
  who: openWho,
  places: openPlace,
  projects: openProject,
  notes: openNote,
  topics: openTopic,
  procedures: openProcedure,
  runs: openRun,
  media: openMedia,
  style: openStyle,
};

/** A document's raw data opened the way its listener opens it; one its listener would drop or mark unreadable can't be shown. */
const open = async (
  kind: HelmHeldKind,
  id: string,
  data: DocumentData,
  read: SealedReader,
): Promise<Opened | typeof UNSHOWABLE> => {
  const entry = {
    id,
    exists: () => true,
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
  const opened = await OPENERS[kind](entry, read).catch(() => null);
  const item = Array.isArray(opened) ? (opened[0] ?? null) : opened;
  if (item === null) return UNSHOWABLE;
  if ((item as { isUnreadable?: boolean }).isUnreadable === true) {
    return UNSHOWABLE;
  }
  return item as Opened;
};

const changedFields = (before: Opened | null, after: Opened): string[] =>
  Object.keys(after).filter(
    (key) =>
      before === null ||
      toFingerprint((before as unknown as Record<string, unknown>)[key]) !==
        toFingerprint((after as unknown as Record<string, unknown>)[key]),
  );

/** Each listed record the transaction changed, opened; null when any of them can't be worked out or opened, so none is held. */
const buildHolds = async (
  writes: RecordedWrite[],
  reads: RecordedReads,
  uid: string,
  token: string,
  read: SealedReader,
): Promise<HelmHoldInput['writes'] | null> => {
  const projected = await projectRecordedWrites(writes, reads);
  const targets = projected.flatMap((doc) => {
    const target = readTarget(doc.segments, uid);
    return target === null ? [] : [{ ...target, doc }];
  });
  if (targets.length > HELD_RECORD_CAP) return null;
  if (targets.some(({ doc }) => 'isUnknown' in doc)) return null;
  const built = await Promise.all(
    targets.map(async ({ kind, id, doc }) => {
      if ('isUnknown' in doc) return UNSHOWABLE;
      if (doc.after === null) {
        return doc.before === null
          ? null
          : { kind, hold: toHeldWrite(id, null, [], token) };
      }
      const after = await open(kind, id, doc.after, read);
      if (after === UNSHOWABLE) return UNSHOWABLE;
      const before =
        doc.before === null ? null : await open(kind, id, doc.before, read);
      const fields = changedFields(
        before === UNSHOWABLE ? null : before,
        after,
      );
      if (fields.length === 0) return null;
      return { kind, hold: toHeldWrite(id, after, fields, token) };
    }),
  );
  if (built.includes(UNSHOWABLE)) return null;
  return built.reduce<HelmHoldInput['writes']>((sum, entry) => {
    if (entry === null || entry === UNSHOWABLE) return sum;
    const list = (sum[entry.kind] ?? []) as unknown[];
    return { ...sum, [entry.kind]: [...list, entry.hold] };
  }, {});
};

const isLanded = (token: string) => () => {
  const { held } = store.getState().helm.hold;
  return HELM_HELD_KINDS.every((kind) =>
    held[kind].every((hold) => hold.token !== token),
  );
};

/** A Helm transaction whose changes to listed records show at once, go back if it fails, and are watched until the listeners show them. */
export async function runHeldTransaction<T>(
  uid: string,
  body: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const token = generateUuid();
  const encryption = await getHelmEncryption(uid).catch(() => null);
  const hold = async (writes: RecordedWrite[], reads: RecordedReads) => {
    if (encryption === null) return;
    const built = await buildHolds(
      writes,
      reads,
      uid,
      token,
      createSealedReader(encryption, openJson),
    ).catch(() => null);
    if (built === null || auth.currentUser?.uid !== uid) {
      store.dispatch(dropHelmWrites(token));
      return;
    }
    store.dispatch(holdHelmWrites({ token, writes: built }));
  };
  try {
    const result = await runRecordedTransaction(body, hold);
    store.dispatch(settleHelmWrites(token));
    void watchWriteLanded({
      feature: 'Helm',
      what: 'a change you made',
      hasLanded: isLanded(token),
    });
    return result;
  } catch (error) {
    store.dispatch(dropHelmWrites(token));
    throw error;
  }
}
