import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { store } from '@/store';

import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import type { HelmEncryption, Sealed } from '@apps/helm/types';
import {
  readEffectivePrivacy,
  readPersonMark,
  readPrivacyFacts,
  readSetPrivate,
  type PrivacyFacts,
} from '@apps/helm/utils/privacy';
import {
  PRIVATE_COLLECTIONS,
  buildParentIndex,
  parentsOf,
  planCascade,
  planKeepOnLeaving,
  type Child,
  type ParentIndex,
  type ParentKind,
  type PrivacyRecord,
  type PrivateKind,
} from '@apps/helm/utils/privacyParents';

const BATCH_SIZE = 450;

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
  const loaded = new Set(readChildren().map((child) => child.record.id));
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
  return [...readChildren(), ...found.flat(2)];
}

export type PrivacyWrite =
  | { kind: 'saved'; previous: PrivacyFacts }
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
  return runTransaction(db, async (transaction): Promise<PrivacyWrite> => {
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
        },
        encryption,
      ),
      privacy: readEffectivePrivacy(next, parentFacts),
    });
    return { kind: 'saved', previous };
  });
}

/** Rewrites the class of every child whose parents or mark now give another one, in batches of 450. */
export async function rewriteChildren(
  uid: string,
  parent?: { kind: ParentKind; id: string; encryption: HelmEncryption },
) {
  const children = parent
    ? await readLinkedChildren(uid, parent.encryption, parent.kind, parent.id)
    : readChildren();
  const updates = planCascade(children, readParentIndex());
  const chunks = Array.from(
    { length: Math.ceil(updates.length / BATCH_SIZE) },
    (_, index) => updates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );
  await Promise.all(
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
}

const toParent = (kind: PrivateKind, id: string, encryption: HelmEncryption) =>
  kind === 'project' || kind === 'who' || kind === 'place'
    ? { kind, id, encryption }
    : undefined;

export type SetPrivateResult =
  | { kind: 'saved'; undo: () => Promise<void> }
  | { kind: 'unchanged' }
  | { kind: 'refused'; line: string }
  | { kind: 'offline' | 'missing' | 'unreadable' };

/** The person's switch or words: makes one thing private or not. An inherited class is refused with its own line, and a mark code set is cleared only by this. */
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
  });
  if (outcome.kind === 'refused') return outcome;
  if (outcome.kind === 'unchanged') return outcome;
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
  const parent = toParent(kind, id, encryption);
  await rewriteChildren(uid, parent);
  return {
    kind: 'saved',
    undo: async () => {
      await writePrivacy(
        uid,
        encryption,
        kind,
        id,
        () => written.previous,
        parentFacts,
      );
      await rewriteChildren(uid, parent);
    },
  };
}

/** Before a private project, person or place goes, each child that was private only through it takes its own mark. */
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
  if (kept.length === 0) return;
  await Promise.all(
    kept.map((child) =>
      writePrivacy(
        uid,
        encryption,
        child.kind,
        child.id,
        (facts) => readPersonMark(facts, true),
        [],
      ),
    ),
  );
}
