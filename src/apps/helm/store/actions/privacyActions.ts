import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';
import { store } from '@/store';

import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import type { HelmEncryption, Sealed } from '@apps/helm/types';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { toDayKey } from '@apps/helm/utils/planDays';
import {
  isQuietInEffect,
  readEffectivePrivacy,
  readPersonMark,
  readPrivacyFacts,
  readSetPrivate,
  readSetQuiet,
  type PrivacyFacts,
} from '@apps/helm/utils/privacy';
import {
  PRIVATE_COLLECTIONS,
  buildParentIndex,
  isLinkedTo,
  parentsOf,
  planCascade,
  planKeepOnLeaving,
  withParentFacts,
  type Child,
  type ParentIndex,
  type ParentKind,
  type PrivacyRecord,
  type PrivateKind,
} from '@apps/helm/utils/privacyParents';

const BATCH_SIZE = 450;
const KEEP_CONCURRENCY = 10;

const collectionOf = (uid: string, kind: PrivateKind) =>
  collection(db, 'apps', 'helm', 'users', uid, PRIVATE_COLLECTIONS[kind]);

const named = (items: { id: string; name: string }[]) => items;

/** The parents as the store shows them now; read at tap time, never held. */
export const readParentIndex = (): ParentIndex => {
  const { helm } = store.getState();
  return buildParentIndex(
    named(helm.projects.items),
    named(helm.who.items),
    named(helm.places.items),
  );
};

const readRecords = (kind: PrivateKind): PrivacyRecord[] => {
  const { helm } = store.getState();
  if (kind === 'task')
    return [
      ...new Map(
        [...helm.openTasks.items, ...helm.projectTasks.items].map((task) => [
          task.id,
          task,
        ]),
      ).values(),
    ];
  if (kind === 'project') return helm.projects.items;
  if (kind === 'who') return helm.who.items;
  if (kind === 'place') return helm.places.items;
  if (kind === 'note') return helm.notes.items;
  if (kind === 'topic') return helm.topics.items;
  if (kind === 'fact') return helm.facts.items;
  if (kind === 'habit') return helm.habits.items;
  return helm.procedures.items;
};

const CHILD_KINDS: PrivateKind[] = ['task', 'fact', 'note', 'topic'];

const readChildren = (): Child[] =>
  CHILD_KINDS.flatMap((kind) =>
    readRecords(kind).map((record) => ({ kind, record })),
  );

const LINK_FIELDS: Record<
  PrivateKind,
  Partial<Record<ParentKind, [string, 'eq' | 'has']>>
> = {
  task: {
    project: ['projectId', 'eq'],
    who: ['whoIds', 'has'],
    place: ['placeIds', 'has'],
  },
  fact: {
    project: ['projectIds', 'has'],
    who: ['subjectIds', 'has'],
    place: ['subjectIds', 'has'],
  },
  note: { project: ['projectIds', 'has'] },
  topic: { project: ['projectIds', 'has'] },
  project: {},
  who: {},
  place: {},
  procedure: {},
  habit: {
    project: ['projectId', 'eq'],
    who: ['forWhoId', 'eq'],
  },
};

const asIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

/** Every child filed under or about a parent, read from the database so one the screen never loaded is not missed; the store's copy wins where both have it. */
async function readLinkedChildren(
  uid: string,
  encryption: HelmEncryption,
  parentKind: ParentKind,
  parentId: string,
): Promise<Child[]> {
  const loadedChildren = readChildren();
  const loaded = new Set(loadedChildren.map((child) => child.record.id));
  const found = await Promise.all(
    CHILD_KINDS.flatMap((kind) => {
      const link = LINK_FIELDS[kind][parentKind];
      if (!link) return [];
      return [
        getDocs(
          query(
            collectionOf(uid, kind),
            where(
              link[0],
              link[1] === 'eq' ? '==' : 'array-contains',
              parentId,
            ),
          ),
        ).then((snapshot) =>
          Promise.all(
            snapshot.docs
              .filter((entry) => !loaded.has(entry.id))
              .map(async (entry): Promise<Child[]> => {
                const data = entry.data() as Record<string, unknown>;
                const opened = await openJson<Record<string, unknown>>(
                  data.sealed as Sealed,
                  encryption,
                ).catch(() => null);
                if (!opened) return [];
                return [
                  {
                    kind,
                    record: {
                      id: entry.id,
                      privacy: data.privacy === 'private' ? 'private' : null,
                      projectId:
                        typeof data.projectId === 'string'
                          ? data.projectId
                          : null,
                      projectIds: asIds(data.projectIds),
                      whoIds: asIds(data.whoIds),
                      placeIds: asIds(data.placeIds),
                      subjectIds: asIds(data.subjectIds),
                      ...readPrivacyFacts(opened as Partial<PrivacyFacts>),
                    },
                  },
                ];
              }),
          ),
        ),
      ];
    }),
  );
  return [
    ...loadedChildren.filter((child) =>
      isLinkedTo(child.kind, child.record, parentKind, parentId),
    ),
    ...found.flat(2),
  ];
}

export type PrivacyWrite =
  | { kind: 'saved'; previous: PrivacyFacts; next: PrivacyFacts }
  | { kind: 'offline' | 'missing' | 'unreadable' };

/** Re-reads the record, changes only its own mark and its class in one transaction, so a change made on another device meanwhile is kept. Needs a connection. */
export async function writePrivacy(
  uid: string,
  encryption: HelmEncryption,
  kind: PrivateKind,
  id: string,
  change: (facts: PrivacyFacts) => PrivacyFacts,
  parentFacts: PrivacyFacts[],
): Promise<PrivacyWrite> {
  if (!navigator.onLine) return { kind: 'offline' };
  const ref = doc(collectionOf(uid, kind), id);
  return runHeldTransaction(uid, async (transaction): Promise<PrivacyWrite> => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return { kind: 'missing' };
    const opened = await openJson<Record<string, unknown>>(
      (snapshot.data() as { sealed: Sealed }).sealed,
      encryption,
    ).catch(() => null);
    if (!opened) return { kind: 'unreadable' };
    const previous = readPrivacyFacts(opened as Partial<PrivacyFacts>);
    const next = change(previous);
    transaction.update(ref, {
      sealed: await sealJson(
        {
          ...opened,
          privateMark: next.privateMark,
          isPrivacyCleared: next.isPrivacyCleared,
          quietMark: next.quietMark ?? null,
          quietUntil: next.quietUntil ?? null,
          isQuietCleared: next.isQuietCleared ?? false,
        },
        encryption,
      ),
      privacy: readEffectivePrivacy(next, parentFacts),
    });
    return { kind: 'saved', previous, next };
  });
}

interface CascadeParent {
  kind: ParentKind;
  id: string;
  encryption: HelmEncryption;
  /** The parent's facts as the write that triggered the cascade left them. */
  facts: PrivacyFacts;
}

/** Rewrites the class of every child filed under a parent whose facts just changed, in batches of 450; answers how many batches did not save. */
export async function rewriteChildren(uid: string, parent: CascadeParent) {
  const children = await readLinkedChildren(
    uid,
    parent.encryption,
    parent.kind,
    parent.id,
  );
  const updates = planCascade(
    children,
    withParentFacts(readParentIndex(), parent.kind, parent.id, parent.facts),
  );
  const chunks = Array.from(
    { length: Math.ceil(updates.length / BATCH_SIZE) },
    (_, index) => updates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );
  const outcomes = await Promise.allSettled(
    chunks.map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((update) =>
        batch.update(doc(collectionOf(uid, update.kind), update.id), {
          privacy: update.privacy,
        }),
      );
      return batch.commit();
    }),
  );
  return outcomes.filter((outcome) => outcome.status === 'rejected').length;
}

const toParent = (
  kind: PrivateKind,
  id: string,
  encryption: HelmEncryption,
  facts: PrivacyFacts,
) =>
  kind === 'project' || kind === 'who' || kind === 'place'
    ? { kind, id, encryption, facts }
    : null;

export type SetPrivateResult =
  | {
      kind: 'saved';
      undo: () => Promise<void>;
      /** Some children's class did not follow; asking for the same state again re-runs the cascade for them. */
      isCascadeIncomplete: boolean;
    }
  | { kind: 'unchanged' }
  | { kind: 'refused'; line: string }
  | { kind: 'offline' | 'missing' | 'unreadable' };

/** The person's switch or words: makes one thing private or not. An inherited class is refused with its own line, and a mark code set is cleared only by this. Asking for the state a project, person or place already has re-runs its cascade over the things filed under it: `saved` when some still did not follow, `unchanged` when nothing was left to do. */
export async function setPrivate(
  uid: string,
  kind: PrivateKind,
  id: string,
  isPrivate: boolean,
): Promise<SetPrivateResult> {
  const record = readRecords(kind).find((entry) => entry.id === id);
  if (!record) return { kind: 'missing' };
  const index = readParentIndex();
  const parents = parentsOf(kind, record, index);
  const outcome = readSetPrivate({
    current: readPrivacyFacts(record),
    isPrivate,
    parents,
    today: toDayKey(
      Date.now(),
      store.getState().helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
    ),
  });
  if (outcome.kind === 'refused') return outcome;
  if (outcome.kind === 'unchanged') {
    const retried = toParent(
      kind,
      id,
      await getHelmEncryption(uid),
      readPrivacyFacts(record),
    );
    if (!retried || (await rewriteChildren(uid, retried)) === 0) return outcome;
    return {
      kind: 'saved',
      isCascadeIncomplete: true,
      undo: async () => {},
    };
  }
  const encryption = await getHelmEncryption(uid);
  const parentFacts = parents.map((parent) => parent.facts);
  const written = await writePrivacy(
    uid,
    encryption,
    kind,
    id,
    (facts) => readPersonMark(facts, isPrivate),
    parentFacts,
  );
  if (written.kind !== 'saved') return written;
  const cascade = async (facts: PrivacyFacts) => {
    const parent = toParent(kind, id, encryption, facts);
    return parent ? (await rewriteChildren(uid, parent)) > 0 : false;
  };
  const isCascadeIncomplete = await cascade(written.next);
  return {
    kind: 'saved',
    isCascadeIncomplete,
    undo: async () => {
      await writePrivacy(
        uid,
        encryption,
        kind,
        id,
        () => written.previous,
        parentFacts,
      );
      await cascade(written.previous);
    },
  };
}

export type QuietKind = 'task' | 'project' | 'note';

/** The person's switch or date for keeping one thing quiet (shown on screen, never said aloud). Keeping it quiet makes it private too, with the same cascade; releasing leaves it private, and a quiet that comes from a parent is refused with its own line. `until` is the last quiet day, or null for no end. */
export async function setQuiet(
  uid: string,
  kind: QuietKind,
  id: string,
  isQuiet: boolean,
  until: string | null,
): Promise<SetPrivateResult> {
  const record = readRecords(kind).find((entry) => entry.id === id);
  if (!record) return { kind: 'missing' };
  const parents = parentsOf(kind, record, readParentIndex());
  const zone =
    store.getState().helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const today = toDayKey(Date.now(), zone);
  const read = (current: PrivacyFacts) =>
    readSetQuiet({ current, isQuiet, until, mark: 'person', parents, today });
  const outcome = read(readPrivacyFacts(record));
  if (outcome.kind === 'refused') return outcome;
  if (outcome.kind === 'unchanged') {
    const retried = toParent(
      kind,
      id,
      await getHelmEncryption(uid),
      readPrivacyFacts(record),
    );
    if (!retried || (await rewriteChildren(uid, retried)) === 0) return outcome;
    return {
      kind: 'saved',
      isCascadeIncomplete: true,
      undo: async () => {},
    };
  }
  const encryption = await getHelmEncryption(uid);
  const parentFacts = parents.map((parent) => parent.facts);
  const written = await writePrivacy(
    uid,
    encryption,
    kind,
    id,
    (facts) => {
      const next = read(facts);
      return next.kind === 'applied' ? next.facts : facts;
    },
    parentFacts,
  );
  if (written.kind !== 'saved') return written;
  const cascade = async (facts: PrivacyFacts) => {
    const parent = toParent(kind, id, encryption, facts);
    return parent ? (await rewriteChildren(uid, parent)) > 0 : false;
  };
  const isCascadeIncomplete = await cascade(written.next);
  return {
    kind: 'saved',
    isCascadeIncomplete,
    undo: async () => {
      const { previous } = written;
      const putBack = await writePrivacy(
        uid,
        encryption,
        kind,
        id,
        (facts) => ({
          ...facts,
          privateMark: previous.privateMark,
          isPrivacyCleared: previous.isPrivacyCleared,
          quietMark: previous.quietMark ?? null,
          quietUntil: previous.quietUntil ?? null,
          isQuietCleared: previous.isQuietCleared ?? false,
        }),
        parentFacts,
      );
      if (putBack.kind !== 'saved')
        throw new Error(`The quiet change was not put back: ${putBack.kind}`);
      await cascade(putBack.next);
    },
  };
}

/** Whether a record on the device is kept quiet today, by its own mark or a quiet parent; a record the device doesn't hold is not. */
export function isKeptQuietOnDevice(kind: PrivateKind, id: string) {
  const record = readRecords(kind).find((entry) => entry.id === id);
  if (!record) return false;
  const zone =
    store.getState().helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  return isQuietInEffect(
    readPrivacyFacts(record),
    parentsOf(kind, record, readParentIndex()).map((parent) => parent.facts),
    toDayKey(Date.now(), zone),
  );
}

/** Whether a turn's words must stay unspoken: it held its line, or it touched something kept quiet on this device. */
export function isExecutionHeld(execution: {
  heldSpoken?: string | null;
  effectRefs: { collection: string; docId: string }[];
}) {
  return (
    (execution.heldSpoken ?? null) !== null ||
    execution.effectRefs.some((ref) => {
      const kind = (Object.keys(PRIVATE_COLLECTIONS) as PrivateKind[]).find(
        (each) => PRIVATE_COLLECTIONS[each] === ref.collection,
      );
      return kind ? isKeptQuietOnDevice(kind, ref.docId) : false;
    })
  );
}

/** Thrown when a child that is private only through a parent about to go could not be given its own mark: the parent stays. */
export class KeepPrivateError extends Error {
  constructor() {
    super('Some private things could not be kept private.');
    this.name = 'KeepPrivateError';
  }
}

/** Before a private project, person or place goes, each child that was private only through it takes its own mark; every one must be saved, or the delete is refused. */
export async function keepInheritedPrivate(
  uid: string,
  parentKind: ParentKind,
  parentId: string,
) {
  const index = readParentIndex();
  const encryption = await getHelmEncryption(uid);
  const kept = planKeepOnLeaving(
    parentKind,
    parentId,
    await readLinkedChildren(uid, encryption, parentKind, parentId),
    index,
  );
  const chunks = Array.from(
    { length: Math.ceil(kept.length / KEEP_CONCURRENCY) },
    (_, at) => kept.slice(at * KEEP_CONCURRENCY, (at + 1) * KEEP_CONCURRENCY),
  );
  const isAllSaved = await chunks.reduce(async (before, chunk) => {
    if (!(await before)) return false;
    const results = await Promise.all(
      chunk.map((child) =>
        writePrivacy(
          uid,
          encryption,
          child.kind,
          child.id,
          (facts) => readPersonMark(facts, true),
          [],
        ).then(
          (written) => written.kind === 'saved' || written.kind === 'missing',
          () => false,
        ),
      ),
    );
    return results.every(Boolean);
  }, Promise.resolve(true));
  if (!isAllSaved) throw new KeepPrivateError();
}
