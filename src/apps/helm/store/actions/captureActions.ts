import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { CAPTURE_MAX_CHARS } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  sortCapture,
  type SortOutcome,
} from '@apps/helm/queries/nomosMutations';
import { openJson, sealJson } from '@apps/helm/security';
import {
  addEarlierCaptures,
  addEarlierExecutions,
  addFailedExecutions,
  setEarlierFailed,
  startLoadingEarlier,
} from '@apps/helm/store/helmSlice';
import { loadEarlierCaptures } from '@apps/helm/store/listeners/captureListener';
import { fetchExecutionsById } from '@apps/helm/store/listeners/executionListener';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import { toTaskTitle } from '@apps/helm/utils/heldCaptures';
import { getRecentWindowStart } from '@apps/helm/utils/sessions';
import type {
  Capture,
  CaptureReading,
  CaptureSealed,
  HelmEncryption,
  OpenCapture,
  Task,
  TaskSealed,
} from '@apps/helm/types';

const BATCH_LIMIT = 400;
const executionsInFlight = new Set<string>();

const capturesOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'captures');

/** Seals what the person typed and starts writing it as a received turn; the write is handed back unawaited. The words are never edited afterwards. */
export async function sendCapture(
  uid: string,
  encryption: HelmEncryption,
  turn: {
    text: string;
    sessionId: string;
    turnIndex: number;
    createdAt: number;
    reading: CaptureReading;
  },
) {
  const text = turn.text.trim();
  if (!text || text.length > CAPTURE_MAX_CHARS) {
    throw new Error('A turn is 1 to 4,000 characters.');
  }
  const sealed = await sealJson<CaptureSealed>(
    { text, reading: turn.reading },
    encryption,
  );
  const { createdAt } = turn;
  // Typed on home, its card is seen as it is sent, so it never waits in New since you looked.
  const capture: Capture = {
    inputMode: 'typed',
    medium: 'web',
    sessionId: turn.sessionId,
    turnIndex: turn.turnIndex,
    route: null,
    status: 'received',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
    executionIds: [],
    seenAt: createdAt,
    createdAt,
    sortedAt: null,
    sealed,
  };
  const reference = doc(capturesOf(uid));
  const write = setDoc(reference, capture);
  // Once the write is acknowledged the server reads the turn; offline that happens when the device is back.
  void write.then(
    () => sortCapture(reference.id),
    () => undefined,
  );
  return { write };
}

/** Fetches the executions of sorted turns that aren't in the store, once each; one that can't be opened is recorded so its turn says so. Reads the store at the call and stops if another person's Helm is open. */
export async function loadExecutionsById(uid: string, ids: string[]) {
  const { helm } = store.getState();
  if (helm.uid !== uid) return;
  const known = selectExecutionsById(store.getState());
  const wanted = ids.filter(
    (id) =>
      !known.has(id) &&
      !executionsInFlight.has(id) &&
      !helm.failedExecutionIds.includes(id),
  );
  if (wanted.length === 0) return;
  wanted.forEach((id) => executionsInFlight.add(id));
  try {
    const encryption = await getHelmEncryption(uid);
    const read = createSealedReader(encryption, openJson);
    const { opened, failedIds } = await fetchExecutionsById(uid, read, wanted);
    if (store.getState().helm.uid !== uid) return;
    store.dispatch(addEarlierExecutions(opened));
    store.dispatch(addFailedExecutions(failedIds));
  } catch (error) {
    console.error('Helm activity did not load', error);
    // Offline is not broken: the turn asks again on its next mount.
    if (navigator.onLine && store.getState().helm.uid === uid) {
      store.dispatch(addFailedExecutions(wanted));
    }
  } finally {
    wanted.forEach((id) => executionsInFlight.delete(id));
  }
}

/** Brings in the next page of earlier sessions, once at a time; reads the store at the call, and stops if another person's Helm is open. */
export async function loadEarlierSessions(uid: string) {
  const { helm } = store.getState();
  if (helm.uid !== uid || helm.earlier.isLoading || helm.earlier.isExhausted) {
    return;
  }
  const before = Math.min(
    getRecentWindowStart(Date.now()),
    ...helm.earlier.captures.map((capture) => capture.createdAt),
  );
  store.dispatch(startLoadingEarlier());
  try {
    const encryption = await getHelmEncryption(uid);
    const read = createSealedReader(encryption, openJson);
    const page = await loadEarlierCaptures(uid, read, before);
    // What the page's turns did is brought with them; one that can't be opened is marked, so its turn says so.
    await loadExecutionsById(
      uid,
      page.captures.flatMap((capture) => capture.executionIds),
    );
    if (store.getState().helm.uid !== uid) return;
    store.dispatch(addEarlierCaptures(page));
  } catch (error) {
    console.error('Helm earlier turns did not load', error);
    store.dispatch(setEarlierFailed());
  }
}

export const markCaptureSeen = (uid: string, captureId: string) =>
  updateDoc(doc(capturesOf(uid), captureId), { seenAt: Date.now() });

export const markAiNoticeSeen = (uid: string) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), { hasSeenAiNotice: true });

/** Marks every given turn seen, in batches under Firestore's write limit. */
export async function markAllSeen(uid: string, captureIds: string[]) {
  const seenAt = Date.now();
  const chunks = Array.from(
    { length: Math.ceil(captureIds.length / BATCH_LIMIT) },
    (_, index) =>
      captureIds.slice(index * BATCH_LIMIT, (index + 1) * BATCH_LIMIT),
  );
  await Promise.all(
    chunks.map((ids) => {
      const batch = writeBatch(db);
      ids.forEach((id) => batch.update(doc(capturesOf(uid), id), { seenAt }));
      return batch.commit();
    }),
  );
}

const tasksOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'tasks');

/** Puts a failed or unreadable turn back to received, with its attempts spent and its hold cleared, and asks the server to read it again. */
export async function retryCapture(
  uid: string,
  capture: OpenCapture,
): Promise<SortOutcome> {
  const now = Date.now();
  // A new reading settles the turn afresh, so the question it leaves behind is closed.
  const closedQuestions = Object.fromEntries(
    Object.entries(capture.questionState)
      .filter(([, question]) => question.answeredAt === null)
      .map(([id]) => [`questionState.${id}.answeredAt`, now]),
  );
  await updateDoc(doc(capturesOf(uid), capture.id), {
    status: 'received',
    attempts: 0,
    lastErrorCode: null,
    heldReason: null,
    ...closedQuestions,
  });
  return sortCapture(capture.id);
}

/** Asks the server to file what a turn held back past its first 20 changes. */
export const sortRestOfCapture = (captureId: string) =>
  sortCapture(captureId, 'rest');

export const deleteCapture = (uid: string, captureId: string) =>
  deleteDoc(doc(capturesOf(uid), captureId));

/** Makes one task from a held turn's words as written and marks the turn sorted, in one batch handed back unawaited so it works offline. `undo` deletes the task and puts the turn back as it was. */
export async function makeTaskAsWritten(
  uid: string,
  encryption: HelmEncryption,
  capture: OpenCapture,
) {
  const title = toTaskTitle(capture.text);
  if (!title) throw new Error('A turn with no words can not become a task.');
  const now = Date.now();
  const task: Task = {
    status: 'open',
    importance: null,
    isUrgent: false,
    due: null,
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
    sourceCaptureId: capture.id,
    executionId: null,
    createdAt: now,
    lastEditedAt: null,
    completedAt: null,
    sealed: await sealJson<TaskSealed>(
      { title, notes: null, steps: {} },
      encryption,
    ),
  };
  const openQuestionIds = Object.entries(capture.questionState)
    .filter(([, question]) => question.answeredAt === null)
    .map(([id]) => id);
  const questionFields = (answeredAt: number | null) =>
    Object.fromEntries(
      openQuestionIds.map((id) => [
        `questionState.${id}.answeredAt`,
        answeredAt,
      ]),
    );
  const captureRef = doc(capturesOf(uid), capture.id);
  const taskRef = doc(tasksOf(uid));
  const batch = writeBatch(db);
  batch.set(taskRef, task);
  batch.update(captureRef, {
    status: 'sorted',
    sortedAt: now,
    seenAt: now,
    ...questionFields(now),
  });
  const write = batch.commit();
  const undo = () => {
    const reverse = writeBatch(db);
    reverse.delete(taskRef);
    reverse.update(captureRef, {
      status: capture.status,
      sortedAt: capture.sortedAt,
      seenAt: capture.seenAt,
      ...questionFields(null),
    });
    return reverse.commit();
  };
  return { write, undo };
}
