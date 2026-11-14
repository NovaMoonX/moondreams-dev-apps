import {
  collection,
  doc,
  runTransaction,
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
export async function rewriteChildren(uid: string) {
  const updates = planCascade(readChildren(), readParentIndex());
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
  await rewriteChildren(uid);
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
      await rewriteChildren(uid);
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
  const kept = planKeepOnLeaving(parentKind, parentId, readChildren(), index);
  if (kept.length === 0) return;
  const encryption = await getHelmEncryption(uid);
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
