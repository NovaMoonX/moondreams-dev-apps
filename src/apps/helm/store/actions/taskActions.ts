import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { store } from '@/store';

import { TASK_TITLE_CAP } from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  Sealed,
  Task,
  TaskDue,
  TaskPlainFields,
  TaskSealed,
  TaskWordsChange,
} from '@apps/helm/types';
import { readParentIndex } from '@apps/helm/store/actions/privacyActions';
import { readPrivacyFacts, readPrivateMark } from '@apps/helm/utils/privacy';
import {
  readNewRecordPrivacy,
  readRecordPrivacy,
} from '@apps/helm/utils/privacyParents';
import { toTaskTitle } from '@apps/helm/utils/heldCaptures';
import {
  planPhotoRelease,
  type ReleasablePhoto,
} from '@apps/helm/utils/mediaRelease';
import { applyWordsChange, nextStepOrder } from '@apps/helm/utils/taskEdits';

export type WordsResult = 'saved' | 'offline' | 'missing' | 'unreadable';
export type RestoreResult = 'restored' | 'exists';

const tasksOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'tasks');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

/** Makes a task from words typed in the app, with no assistant run behind it. The write is handed back unawaited so it works offline. */
export async function createTask(
  uid: string,
  encryption: HelmEncryption,
  input: { title: string; due: TaskDue | null; isPrivate?: boolean },
) {
  const title = toTaskTitle(input.title).slice(0, TASK_TITLE_CAP);
  if (!title) throw new Error('A task needs words.');
  const { facts, privacy } = readNewRecordPrivacy(
    'task',
    { id: '' },
    title,
    readParentIndex(),
    { isPrivate: input.isPrivate === true },
  );
  const task: Task = {
    status: 'open',
    importance: null,
    isUrgent: false,
    due: input.due,
    durationMinutes: null,
    energy: null,
    context: null,
    projectId: null,
    milestoneId: null,
    whoIds: [],
    placeIds: [],
    notUntil: null,
    waitsOnTaskIds: [],
    waitsOnWhoId: null,
    stepState: {},
    mediaIds: [],
    createdBy: 'person',
    sourceCaptureId: null,
    executionId: null,
    privacy,
    createdAt: Date.now(),
    lastEditedAt: null,
    completedAt: null,
    clearedAt: null,
    sealed: await sealJson<TaskSealed>(
      {
        title,
        notes: null,
        steps: {},
        privateMark: facts.privateMark,
        isPrivacyCleared: facts.isPrivacyCleared,
      },
      encryption,
    ),
  };
  const ref = doc(tasksOf(uid));
  return { id: ref.id, write: setDoc(ref, task) };
}

const hasLinkChange = (fields: TaskPlainFields) =>
  'projectId' in fields || 'whoIds' in fields || 'placeIds' in fields;

/** A change of link carries the task's class with it, so the filing line and a job without the key agree. */
const readLinkedPrivacy = (taskId: string, fields: TaskPlainFields) => {
  const { helm } = store.getState();
  const task = [...helm.openTasks.items, ...helm.projectTasks.items].find(
    (entry) => entry.id === taskId,
  );
  return task
    ? {
        privacy: readRecordPrivacy(
          'task',
          { ...task, ...fields, privacy: null },
          readParentIndex(),
        ),
      }
    : {};
};

export const updateTaskFields = (
  uid: string,
  taskId: string,
  fields: TaskPlainFields,
) =>
  updateDoc(doc(tasksOf(uid), taskId), {
    ...fields,
    ...(hasLinkChange(fields) ? readLinkedPrivacy(taskId, fields) : {}),
    lastEditedAt: Date.now(),
  });

/** Changes a task's words in one transaction that re-reads them first, so a change made on another device meanwhile is kept. Needs a connection. */
export async function updateTaskWords(
  uid: string,
  encryption: HelmEncryption,
  taskId: string,
  change: TaskWordsChange,
): Promise<WordsResult> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(tasksOf(uid), taskId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<WordsResult> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const data = snapshot.data() as Pick<Task, 'sealed' | 'stepState'>;
        const opened = await openJson<TaskSealed>(
          data.sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        const changed = applyWordsChange(opened, change);
        const before = readPrivacyFacts(opened);
        const marked =
          change.kind === 'title'
            ? readPrivateMark({
                current: before,
                isCare: false,
                isForOtherWho: false,
                commandMark: null,
                isSensitiveHealth: false,
                words: change.title,
              })
            : before;
        const isNewlyMarked = marked.privateMark !== before.privateMark;
        const sealed = await sealJson<TaskSealed>(
          isNewlyMarked
            ? { ...changed, privateMark: marked.privateMark }
            : changed,
          encryption,
        );
        const stepFields =
          change.kind === 'addStep'
            ? {
                [`stepState.${change.stepId}`]: {
                  order: nextStepOrder(data.stepState ?? {}),
                  doneAt: null,
                },
              }
            : change.kind === 'removeStep'
              ? { [`stepState.${change.stepId}`]: deleteField() }
              : {};
        transaction.update(ref, {
          sealed,
          lastEditedAt: Date.now(),
          ...(isNewlyMarked && { privacy: 'private' }),
          ...stepFields,
        });
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export const tickTaskStep = (
  uid: string,
  taskId: string,
  stepId: string,
  doneAt: number | null,
) =>
  updateDoc(doc(tasksOf(uid), taskId), {
    [`stepState.${stepId}.doneAt`]: doneAt,
    lastEditedAt: Date.now(),
  });

export const moveTaskStep = (
  uid: string,
  taskId: string,
  orders: Record<string, number>,
) =>
  updateDoc(doc(tasksOf(uid), taskId), {
    ...Object.fromEntries(
      Object.entries(orders).map(([id, order]) => [
        `stepState.${id}.order`,
        order,
      ]),
    ),
    lastEditedAt: Date.now(),
  });

export const reopenTask = (uid: string, taskId: string) =>
  updateDoc(doc(tasksOf(uid), taskId), {
    status: 'open',
    completedAt: null,
    clearedAt: null,
    lastEditedAt: Date.now(),
  });

/** Puts a reopened task back as done on the day it was done, only while it is still open; answers whether it did. */
export async function markDoneAgain(
  uid: string,
  taskId: string,
  completedAt: number | null,
) {
  const ref = doc(tasksOf(uid), taskId);
  const stored = (await getDoc(ref)).data();
  if (stored?.status !== 'open') return false;
  await updateDoc(ref, {
    status: 'done',
    completedAt: completedAt ?? Date.now(),
    clearedAt: null,
    lastEditedAt: Date.now(),
  });
  return true;
}

/** Marks a task done in one write handed back unawaited. `undo` reopens it only while it is still done from this tap; it answers whether it did. */
export function completeTask(uid: string, taskId: string) {
  const ref = doc(tasksOf(uid), taskId);
  const completedAt = Date.now();
  const write = updateDoc(ref, {
    status: 'done',
    completedAt,
    clearedAt: null,
    lastEditedAt: completedAt,
  });
  const undo = async () => {
    const stored = (await getDoc(ref)).data();
    if (stored?.status !== 'done' || stored.completedAt !== completedAt) {
      return false;
    }
    reopenTask(uid, taskId).catch(() => undefined);
    return true;
  };
  return { completedAt, write, undo };
}

/** Deletes a task, keeping a copy as it was so `restore` can put it back, only while nothing has taken its id. The photos kept only on it are let go for 24 hours, each in its own write so a photo already gone never holds back the task, and `restore` keeps them again. Writes are handed back or left unawaited, so both work offline. */
export async function deleteTask(
  uid: string,
  taskId: string,
  photos: ReleasablePhoto[],
) {
  const ref = doc(tasksOf(uid), taskId);
  const raw = (await getDocFromCache(ref).catch(() => getDoc(ref))).data();
  if (!raw) throw new Error('This task is already gone.');
  const released = planPhotoRelease(
    photos,
    [{ kind: 'task', id: taskId }],
    Date.now(),
  );
  const mediaRef = (id: string) =>
    doc(db, 'apps', 'helm', 'users', uid, 'media', id);
  const write = deleteDoc(ref);
  released.forEach((entry) =>
    updateDoc(mediaRef(entry.id), entry.forward).catch(() => undefined),
  );
  const restore = async (): Promise<RestoreResult> => {
    if ((await getDoc(ref)).exists()) return 'exists';
    setDoc(ref, { ...raw, lastEditedAt: Date.now() }).catch(() => undefined);
    released.forEach((entry) =>
      updateDoc(mediaRef(entry.id), entry.back).catch(() => undefined),
    );
    return 'restored';
  };
  return { write, restore };
}
