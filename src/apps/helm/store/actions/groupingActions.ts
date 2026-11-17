import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { HELM_COPY, NOTE_TOPICS_MAX } from '@apps/helm/constants';
import {
  applyGroupingNotNow,
  dropSource,
  readGrouping,
} from '@apps/helm/engine/grouping';
import { readUndoFields, toGroupingUndoPatch } from '@apps/helm/nomos/planUndo';
import type { UndoResult } from '@apps/helm/nomos/undoExecution';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import { createProject } from '@apps/helm/store/actions/projectActions';
import {
  createTopic,
  isUnavailable,
} from '@apps/helm/store/actions/topicActions';
import type {
  Execution,
  ExecutionSealed,
  Grouping,
  HelmEncryption,
  Note,
  OpenGrouping,
  Task,
  Topic,
} from '@apps/helm/types';

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const groupingsOf = (uid: string) => collection(userOf(uid), 'groupings');
const executionsOf = (uid: string) => collection(userOf(uid), 'executions');

const splitKey = (key: string) => {
  const at = key.indexOf('/');
  return { collection: key.slice(0, at), id: key.slice(at + 1) };
};

const readGroupings = (uid: string) =>
  store.getState().helm.uid === uid
    ? store.getState().helm.groupings.items
    : [];

const offerName = (grouping: OpenGrouping) =>
  grouping.proposedTitle?.trim() ||
  Object.values(grouping.titles).find((title) => title.trim().length > 0) ||
  '';

interface Parent {
  id: string;
  name: string;
  isMade: boolean;
  written: Promise<unknown>;
}

async function resolveParent(
  uid: string,
  encryption: HelmEncryption,
  grouping: OpenGrouping,
): Promise<Parent | null> {
  const { helm } = store.getState();
  if (grouping.parentId) {
    const found =
      grouping.parentKind === 'project'
        ? helm.projects.items.find((one) => one.id === grouping.parentId)
        : helm.topics.items.find((one) => one.id === grouping.parentId);
    if (found && !found.isUnreadable)
      return {
        id: found.id,
        name: 'name' in found ? found.name : '',
        isMade: false,
        written: Promise.resolve(),
      };
  }
  const name = offerName(grouping);
  if (!name) return null;
  if (grouping.parentKind === 'project') {
    const made = await createProject(uid, encryption, {
      name,
      emoji: grouping.emoji,
      objective: null,
      targetDate: null,
    });
    return { id: made.id, name, isMade: true, written: made.written };
  }
  const made = await createTopic(
    uid,
    encryption,
    { name, emoji: grouping.emoji, parentId: null },
    helm.topics.items,
  );
  return made.kind === 'made'
    ? { id: made.id, name, isMade: true, written: made.written }
    : null;
}

interface Link {
  key: string;
  ref: DocumentReference;
  fields: Record<string, unknown>;
}

function planLinks(
  uid: string,
  grouping: OpenGrouping,
  parent: Parent,
  now: number,
): Link[] {
  const { helm } = store.getState();
  const isProject = grouping.parentKind === 'project';
  const tasks = [...helm.openTasks.items, ...helm.projectTasks.items];
  const topicParent = helm.topics.items.find((one) => one.id === parent.id);
  return grouping.sourceKeys.flatMap((key): Link[] => {
    const { collection: from, id } = splitKey(key);
    if (from === 'tasks') {
      const task = tasks.find((one) => one.id === id);
      return isProject && task && !task.isUnreadable && task.projectId === null
        ? [
            {
              key,
              ref: doc(collection(userOf(uid), 'tasks'), id),
              fields: { projectId: parent.id, lastEditedAt: now },
            },
          ]
        : [];
    }
    if (from === 'notes') {
      const note = helm.notes.items.find((one) => one.id === id);
      if (!note || note.isUnreadable) return [];
      if (isProject)
        return note.projectIds.includes(parent.id)
          ? []
          : [
              {
                key,
                ref: doc(collection(userOf(uid), 'notes'), id),
                fields: {
                  projectIds: arrayUnion(parent.id),
                  lastEditedAt: now,
                },
              },
            ];
      return note.topicIds.includes(parent.id) ||
        note.topicIds.length >= NOTE_TOPICS_MAX
        ? []
        : [
            {
              key,
              ref: doc(collection(userOf(uid), 'notes'), id),
              fields: { topicIds: arrayUnion(parent.id), lastEditedAt: now },
            },
            {
              key: '',
              ref: doc(collection(userOf(uid), 'topics'), parent.id),
              fields: {
                docState:
                  topicParent?.docState === 'writing' ||
                  topicParent?.docState === 'failed'
                    ? topicParent.docState
                    : 'behind',
                pendingNoteIds: arrayUnion(id),
              },
            },
          ];
    }
    if (from === 'topics' && isProject) {
      const topic = helm.topics.items.find((one) => one.id === id);
      return topic &&
        !topic.isUnreadable &&
        !topic.projectIds.includes(parent.id)
        ? [
            {
              key,
              ref: doc(collection(userOf(uid), 'topics'), id),
              fields: {
                projectIds: arrayUnion(parent.id),
                lastEditedAt: now,
              },
            },
          ]
        : [];
    }
    return [];
  });
}

const toExecution = async (
  encryption: HelmEncryption,
  input: {
    grouping: OpenGrouping;
    parent: Parent;
    linkedKeys: string[];
    now: number;
  },
): Promise<Execution> => {
  const { grouping, parent, linkedKeys, now } = input;
  return {
    captureId: null,
    actor: 'person',
    via: null,
    category: 'organize',
    autonomyLevel: 1,
    state: 'succeeded',
    effectRefs: [{ op: 'update', collection: 'groupings', docId: grouping.id }],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    undoneDocIds: null,
    partUndoIds: null,
    questionRef: null,
    errorCode: null,
    privacy: grouping.privacy ?? 'ordinary',
    createdAt: now,
    decidedAt: now,
    finishedAt: now,
    sealed: await sealJson<ExecutionSealed>(
      {
        summary: HELM_COPY.groupingActivityGrouped(
          grouping.sourceKeys.length,
          parent.name,
        ),
        said: null,
        commands: [],
        effects: [
          {
            written: {
              state: 'groupedByYou',
              parentId: parent.id,
              linkedKeys,
              'sealed.title': parent.name,
            },
            previous: {
              state: grouping.state,
              parentId: grouping.parentId,
              answeredAt: grouping.answeredAt,
              'sealed.title': parent.name,
            },
          },
        ],
        undoReport: null,
        spoken: null,
        goneIds: null,
        undoReason: null,
        lines: null,
        abilityOffer: null,
        awayZoneOffer: null,
      },
      encryption,
    ),
  };
};

export type GroupThemResult =
  | {
      kind: 'grouped';
      name: string;
      count: number;
      executionId: string;
      written: Promise<unknown>;
    }
  | { kind: 'failed' };

/** Group them: files the things under one parent in one batch, unawaited so it works offline. */
export async function groupThem(
  uid: string,
  grouping: OpenGrouping,
): Promise<GroupThemResult> {
  const encryption = await getHelmEncryption(uid);
  const parent = await resolveParent(uid, encryption, grouping);
  if (!parent) return { kind: 'failed' };
  const now = Date.now();
  const links = planLinks(uid, grouping, parent, now);
  const synced = grouping.sourceKeys.filter(
    (key) => splitKey(key).collection === 'synced',
  );
  const linkedKeys = [
    ...new Set([...links.map((link) => link.key).filter(Boolean), ...synced]),
  ];
  const executionRef = doc(executionsOf(uid));
  const execution = await toExecution(encryption, {
    grouping,
    parent,
    linkedKeys,
    now,
  });
  const batch = writeBatch(db);
  links.forEach((link) => batch.update(link.ref, link.fields));
  batch.update(doc(groupingsOf(uid), grouping.id), {
    state: 'groupedByYou',
    parentId: parent.id,
    linkedKeys,
    answeredAt: now,
    executionId: executionRef.id,
    updatedAt: now,
  });
  batch.set(executionRef, execution);
  return {
    kind: 'grouped',
    name: parent.name,
    count: grouping.sourceKeys.length,
    executionId: executionRef.id,
    written: Promise.all([parent.written, batch.commit()]),
  };
}

type Restorable = Pick<
  Grouping,
  'state' | 'declineCount' | 'nextOfferAfter' | 'answeredAt'
>;

const putBack = (uid: string, id: string, before: Restorable) => {
  const batch = writeBatch(db);
  batch.update(doc(groupingsOf(uid), id), {
    ...before,
    updatedAt: Date.now(),
  });
  return batch.commit();
};

const answerOf = (grouping: OpenGrouping): Restorable => ({
  state: grouping.state,
  declineCount: grouping.declineCount,
  nextOfferAfter: grouping.nextOfferAfter,
  answeredAt: grouping.answeredAt,
});

/** Not related; unawaited, `undo` puts the answer back. */
export function markNotRelated(uid: string, grouping: OpenGrouping) {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(groupingsOf(uid), grouping.id), {
    state: 'notRelated',
    answeredAt: now,
    updatedAt: now,
  });
  return {
    written: batch.commit(),
    undo: () => putBack(uid, grouping.id, answerOf(grouping)),
  };
}

/** Not now; returns the weeks it waits, null when over. */
export function notNowGrouping(uid: string, grouping: OpenGrouping) {
  const now = Date.now();
  const patch = applyGroupingNotNow(grouping, now);
  const batch = writeBatch(db);
  batch.update(doc(groupingsOf(uid), grouping.id), { ...patch });
  return {
    weeks:
      patch.nextOfferAfter === null
        ? null
        : Math.round((patch.nextOfferAfter - now) / (7 * 86_400_000)),
    written: batch.commit(),
    undo: () => putBack(uid, grouping.id, answerOf(grouping)),
  };
}

export function markGroupingTold(uid: string, id: string) {
  const batch = writeBatch(db);
  batch.update(doc(groupingsOf(uid), id), {
    toldAt: Date.now(),
    updatedAt: Date.now(),
  });
  return batch.commit();
}

/** A deleted source leaves its groupings; unawaited so it works offline. */
export function dropFromGroupings(
  uid: string,
  key: string,
  parent: { kind: 'project' | 'topic'; id: string } | null = null,
) {
  const now = Date.now();
  readGroupings(uid).forEach((grouping) => {
    const ref = doc(groupingsOf(uid), grouping.id);
    const fail = (error: unknown) =>
      console.error('Helm grouping was not updated after a delete', error);
    if (
      parent &&
      grouping.parentKind === parent.kind &&
      grouping.parentId === parent.id
    ) {
      deleteDoc(ref).catch(fail);
      return;
    }
    const dropped = dropSource(grouping, key);
    if (!dropped) return;
    if (dropped.isGone) {
      deleteDoc(ref).catch(fail);
      return;
    }
    const batch = writeBatch(db);
    batch.update(ref, { ...dropped.patch, updatedAt: now });
    batch.commit().catch(fail);
  });
}

/** After a quiet link was taken back: the grouping is a no. */
export function closeGroupings(uid: string, ids: string[], now: number) {
  const batch = writeBatch(db);
  ids.forEach((id) =>
    batch.update(
      doc(groupingsOf(uid), id),
      toGroupingUndoPatch('nomos', null, now),
    ),
  );
  return batch.commit();
}

const ownLinks = (linkedKeys: string[]) =>
  linkedKeys
    .map(splitKey)
    .filter((one) => ['tasks', 'notes', 'topics'].includes(one.collection));

/** Takes back an execution whose only effect is a grouping. */
export async function undoGroupingExecution(
  uid: string,
  encryption: HelmEncryption,
  executionId: string,
): Promise<UndoResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const executionRef = doc(executionsOf(uid), executionId);
  const undoRef = doc(executionsOf(uid));
  try {
    const peek = await getDoc(executionRef);
    const first = peek.exists() ? (peek.data() as Execution) : null;
    const firstRef = first?.effectRefs.find(
      (ref) => ref.collection === 'groupings',
    );
    const firstGrouping = firstRef
      ? readGrouping(
          firstRef.docId,
          (await getDoc(doc(groupingsOf(uid), firstRef.docId))).data(),
        )
      : null;
    const madeParentId =
      first?.actor === 'person' &&
      firstGrouping?.parentId &&
      (
        await openJson<ExecutionSealed>(first.sealed, encryption).catch(
          () => null,
        )
      )?.effects[0]?.previous?.parentId === null
        ? firstGrouping.parentId
        : null;
    const unusedParent =
      firstGrouping && madeParentId
        ? await readIsParentUnused(
            uid,
            firstGrouping.parentKind,
            madeParentId,
            firstGrouping.linkedKeys,
          )
        : false;
    return await runTransaction(
      db,
      async (transaction): Promise<UndoResult> => {
        const snapshot = await transaction.get(executionRef);
        const original = snapshot.exists()
          ? (snapshot.data() as Execution)
          : null;
        const ref = original?.effectRefs.find(
          (item) => item.collection === 'groupings',
        );
        if (!original || !ref)
          return { kind: 'refused', reason: 'missing', report: null };
        if (original.undoneByExecutionId !== null)
          return { kind: 'refused', reason: 'alreadyUndone', report: null };
        const target = doc(groupingsOf(uid), ref.docId);
        const stored = await transaction.get(target);
        const grouping = readGrouping(ref.docId, stored.data());
        if (!grouping || grouping.executionId !== executionId)
          return { kind: 'refused', reason: 'notUndoable', report: null };
        const opened = await openJson<ExecutionSealed>(
          original.sealed,
          encryption,
        ).catch(() => null);
        const previous = opened?.effects[0]?.previous ?? null;
        const isOwn = original.actor === 'person';
        const links = isOwn ? ownLinks(grouping.linkedKeys) : [];
        const linked = await Promise.all(
          links.map(async (link) => ({
            link,
            snapshot: await transaction.get(
              doc(collection(userOf(uid), link.collection), link.id),
            ),
          })),
        );
        const now = Date.now();
        linked.forEach(({ link, snapshot: entry }) => {
          if (!entry.exists() || grouping.parentId === null) return;
          const parent = grouping.parentId;
          if (link.collection === 'tasks') {
            if ((entry.data() as Task).projectId === parent)
              transaction.update(entry.ref, {
                projectId: null,
                lastEditedAt: now,
              });
            return;
          }
          if (grouping.parentKind === 'project') {
            const has = (entry.data() as Note | Topic).projectIds.includes(
              parent,
            );
            if (has)
              transaction.update(entry.ref, {
                projectIds: arrayRemove(parent),
                lastEditedAt: now,
              });
            return;
          }
          if ((entry.data() as Note).topicIds?.includes(parent))
            transaction.update(entry.ref, {
              topicIds: arrayRemove(parent),
              lastEditedAt: now,
            });
        });
        const patch = toGroupingUndoPatch(original.actor, previous, now);
        transaction.update(target, patch);
        if (unusedParent && grouping.parentId !== null) {
          transaction.delete(
            doc(
              collection(
                userOf(uid),
                grouping.parentKind === 'project' ? 'projects' : 'topics',
              ),
              grouping.parentId,
            ),
          );
        }
        transaction.set(undoRef, {
          captureId: original.captureId,
          actor: 'person',
          via: null,
          category: 'undo',
          autonomyLevel: 1,
          state: 'succeeded',
          effectRefs: [
            { op: 'update', collection: 'groupings', docId: ref.docId },
          ],
          linkedWhoIds: [],
          linkedPlaceIds: [],
          undoesExecutionId: executionId,
          undoneByExecutionId: null,
          undoneDocIds: null,
          partUndoIds: null,
          questionRef: null,
          errorCode: null,
          privacy: original.privacy,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: await sealJson<ExecutionSealed>(
            {
              summary: HELM_COPY.groupingTookBackSummary,
              said: null,
              commands: [],
              effects: [
                {
                  written: {
                    state: patch.state,
                    'sealed.title':
                      opened?.effects[0]?.written['sealed.title'] ?? '',
                  },
                  previous: { state: grouping.state },
                },
              ],
              undoReport: HELM_COPY.groupingTookBackReport,
              spoken: null,
              goneIds: null,
              undoReason: null,
              lines: null,
              abilityOffer: null,
              awayZoneOffer: null,
            },
            encryption,
          ),
        } satisfies Execution);
        const earlier = readUndoFields(original);
        const undoneDocIds = [
          ...new Set([
            ...earlier.undoneDocIds,
            ...original.effectRefs.map((item) => item.docId),
          ]),
        ];
        transaction.update(executionRef, {
          undoneByExecutionId: undoRef.id,
          undoneDocIds,
          partUndoIds: [...earlier.partUndoIds, undoRef.id],
        });
        return {
          kind: 'done',
          undoExecutionId: undoRef.id,
          report: HELM_COPY.groupingTookBackReport,
          isFinal: true,
          undoneDocIds,
          objectPaths: [],
        };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

async function readIsParentUnused(
  uid: string,
  kind: 'project' | 'topic',
  parentId: string,
  linkedKeys: string[],
) {
  const own = new Set(linkedKeys.map((key) => splitKey(key).id));
  const found = await Promise.all(
    kind === 'project'
      ? [
          getDocs(
            query(
              collection(userOf(uid), 'tasks'),
              where('projectId', '==', parentId),
            ),
          ),
          getDocs(
            query(
              collection(userOf(uid), 'notes'),
              where('projectIds', 'array-contains', parentId),
            ),
          ),
          getDocs(
            query(
              collection(userOf(uid), 'topics'),
              where('projectIds', 'array-contains', parentId),
            ),
          ),
        ]
      : [
          getDocs(
            query(
              collection(userOf(uid), 'notes'),
              where('topicIds', 'array-contains', parentId),
            ),
          ),
          getDocs(
            query(
              collection(userOf(uid), 'topics'),
              where('parentId', '==', parentId),
            ),
          ),
        ],
  );
  return found.every((result) =>
    result.docs.every((entry) => own.has(entry.id)),
  );
}
