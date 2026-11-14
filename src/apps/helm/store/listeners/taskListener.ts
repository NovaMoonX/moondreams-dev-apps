import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { OPEN_TASKS_LIMIT, PROJECT_TASKS_LIMIT } from '@apps/helm/constants';
import type { OpenTask, Task, TaskSealed } from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your tasks did not open.');

/** A task that won't open is kept, with no title, so the surface can say so instead of dropping it. */
export async function openTask(
  entry: DocumentSnapshot | QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenTask> {
  const data = entry.data() as Partial<Task>;
  const base = {
    id: entry.id,
    status: data.status ?? 'open',
    importance: data.importance ?? null,
    isUrgent: data.isUrgent ?? false,
    due: data.due ?? null,
    durationMinutes: data.durationMinutes ?? null,
    energy: data.energy ?? null,
    context: data.context ?? null,
    projectId: data.projectId ?? null,
    milestoneId: data.milestoneId ?? null,
    whoIds: data.whoIds ?? [],
    placeIds: data.placeIds ?? [],
    notUntil: data.notUntil ?? null,
    waitsOnTaskIds: data.waitsOnTaskIds ?? [],
    waitsOnWhoId: data.waitsOnWhoId ?? null,
    stepState: data.stepState ?? {},
    mediaIds: data.mediaIds ?? [],
    createdBy: data.createdBy ?? 'person',
    sourceCaptureId: data.sourceCaptureId ?? null,
    executionId: data.executionId ?? null,
    createdAt: data.createdAt ?? 0,
    privacy: readPrivacy(data.privacy),
    lastEditedAt: data.lastEditedAt ?? null,
    completedAt: data.completedAt ?? null,
    clearedAt: data.clearedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This task has no sealed words.');
    const payload = await read<Partial<TaskSealed>>(data.sealed);
    return {
      ...base,
      title: payload.title ?? '',
      notes: payload.notes ?? null,
      steps: payload.steps ?? {},
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      title: '',
      notes: null,
      steps: {},
      isUnreadable: true,
      privateMark: null,
      isPrivacyCleared: false,
    };
  }
}

/** The open tasks, newest first. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startOpenTasksListener(
  uid: string,
  read: SealedReader,
  onChange: (tasks: OpenTask[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'tasks'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(OPEN_TASKS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openTask(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** Every task that belongs to a project, open or done, so a project can say what is finished and how long it has been quiet. */
export function startProjectTasksListener(
  uid: string,
  read: SealedReader,
  onChange: (tasks: OpenTask[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'tasks'),
      where('projectId', '!=', null),
      limit(PROJECT_TASKS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openTask(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** Tasks by id, for a day's record of tasks that have since been done; an id that is gone or can't be fetched is left out. */
export async function fetchTasksById(
  uid: string,
  read: SealedReader,
  ids: string[],
): Promise<OpenTask[]> {
  const opened = await Promise.all(
    ids.map((id) =>
      getDoc(doc(db, 'apps', 'helm', 'users', uid, 'tasks', id))
        .then((entry) => (entry.exists() ? openTask(entry, read) : null))
        .catch(() => null),
    ),
  );
  return opened.filter((task): task is OpenTask => task !== null);
}
