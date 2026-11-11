import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  type DocumentReference,
  getDoc,
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
  isSorting,
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
import {
  selectAllCaptures,
  selectExecutionsById,
} from '@apps/helm/store/selectors/captureSelectors';
import {
  canMakeTaskAsWritten,
  toTaskTitle,
} from '@apps/helm/utils/heldCaptures';
import { rankNotes } from '@apps/helm/utils/noteSearch';
import { getRecentWindowStart } from '@apps/helm/utils/sessions';
import type {
  Capture,
  CaptureReading,
  CaptureSealed,
  HelmEncryption,
  OpenCapture,
  QuestionAnswerValue,
  ScreenContext,
  Task,
  TaskSealed,
} from '@apps/helm/types';

const BATCH_LIMIT = 400;
const executionsInFlight = new Set<string>();

const capturesOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'captures');

function writeJoined(
  uid: string,
  leadId: string,
  reference: DocumentReference,
  capture: Capture,
) {
  const batch = writeBatch(db);
  batch.set(reference, capture);
  batch.update(doc(capturesOf(uid), leadId), {
    joinedCaptureIds: arrayUnion(reference.id),
  });
  return batch.commit();
}

/** The ids of the notes that best match words about to be sorted, from the notes the device has open. */
export const rankStoredNotes = (text: string) => {
  const { notes, topics } = store.getState().helm;
  return rankNotes(
    text,
    notes.items.filter((note) => !note.isUnreadable),
    topics.items,
  );
};

/** Seals what the person typed or said and starts writing it as a received turn; the write is handed back unawaited. The words are never edited afterwards. */
export async function sendCapture(
  uid: string,
  encryption: HelmEncryption,
  turn: {
    text: string;
    sessionId: string;
    turnIndex: number;
    createdAt: number;
    leadId: string | null;
    reading: CaptureReading;
    screen: ScreenContext | null;
    /** The question this turn answers and its structured answer (null when a spoken one could not be placed); both null on any other turn. */
    answersQuestion: Capture['answersQuestion'];
    questionAnswer: QuestionAnswerValue | null;
    /** The notes the typed words matched, best first (at most 8); empty when none were ranked. */
    noteIds?: string[];
    /** A spoken turn names the listener that wrote it; a typed one leaves both out. */
    voice?: { sttProvider: string; interruptedCaptureId: string | null };
  },
) {
  const text = turn.text.trim();
  if (!text || text.length > CAPTURE_MAX_CHARS) {
    throw new Error('A turn is 1 to 4,000 characters.');
  }
  const sealed = await sealJson<CaptureSealed>(
    {
      text,
      reading: turn.reading,
      answer: null,
      questionAnswer: turn.questionAnswer,
    },
    encryption,
  );
  const { createdAt } = turn;
  // Typed on home, its card is seen as it is sent, so it never waits in New since you looked.
  const capture: Capture = {
    inputMode: turn.voice ? 'voice' : 'typed',
    sttProvider: turn.voice?.sttProvider ?? null,
    interruptedCaptureId: turn.voice?.interruptedCaptureId ?? null,
    answersQuestion: turn.answersQuestion,
    ttsProvider: null,
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
    turnLeadId: turn.leadId,
    joinedCaptureIds: [],
    seenAt: createdAt,
    quotedSourceKeys: [],
    whoIds: [],
    placeIds: [],
    planDayKey: null,
    createdAt,
    sortedAt: null,
    screen: turn.screen,
    sealed,
  };
  const reference = doc(capturesOf(uid));
  // A message joining a turn is written with its lead's list in one batch, so neither lands without the other.
  const write = turn.leadId
    ? writeJoined(uid, turn.leadId, reference, capture)
    : setDoc(reference, capture);
  // Once the write is acknowledged the server reads the turn; offline that happens when the device is back.
  void write.then(
    () => sortCapture(reference.id, 'full', turn.noteIds ?? []),
    () => undefined,
  );
  return { write, id: reference.id };
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

/** Records which voice said a spoken turn's line; touches only that field. */
export const markCaptureSpoken = (
  uid: string,
  captureId: string,
  ttsProvider: string,
) => updateDoc(doc(capturesOf(uid), captureId), { ttsProvider });

/** Sets a question aside so it waits in Needs you; touches only its own field and runs nothing. */
export const skipQuestion = (
  uid: string,
  captureId: string,
  questionId: string,
) =>
  updateDoc(doc(capturesOf(uid), captureId), {
    [`questionState.${questionId}.skippedAt`]: Date.now(),
  });

/** Marks a question answered without running anything, because what it asked was settled another way; touches only its own fields, and the turn is sorted once none is left open. */
export const closeQuestion = (
  uid: string,
  captureId: string,
  questionId: string,
  isLastOpen: boolean,
) =>
  updateDoc(doc(capturesOf(uid), captureId), {
    [`questionState.${questionId}.answeredAt`]: Date.now(),
    ...(isLastOpen && { status: 'sorted' }),
  });

export const markAiNoticeSeen = (uid: string) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), { hasSeenAiNotice: true });

export const markVoiceNoticeSeen = (uid: string) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    hasSeenVoiceNotice: true,
  });

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
  const joined = selectAllCaptures(store.getState()).filter(
    (entry) =>
      entry.turnLeadId === capture.id &&
      capture.joinedCaptureIds.includes(entry.id) &&
      entry.status !== 'received',
  );
  const batch = writeBatch(db);
  batch.update(doc(capturesOf(uid), capture.id), {
    status: 'received',
    attempts: 0,
    lastErrorCode: null,
    heldReason: null,
    ...closedQuestions,
  });
  joined.forEach((entry) =>
    batch.update(doc(capturesOf(uid), entry.id), {
      status: 'received',
      sortedAt: null,
      claimId: null,
      claimedAt: null,
    }),
  );
  await batch.commit();
  return sortCapture(capture.id, 'full', rankStoredNotes(capture.text));
}

/** Asks the server to file what a turn held back past its first 20 changes. */
export const sortRestOfCapture = (captureId: string) =>
  sortCapture(captureId, 'rest');

export const deleteCapture = (uid: string, captureId: string) =>
  deleteDoc(doc(capturesOf(uid), captureId));

/** Makes one task from a held turn's words as written (the messages that joined it follow, one per line) and marks the turn and its waiting messages sorted, in one batch handed back unawaited so it works offline. `undo` deletes the task and puts the turn back as it was, only while the task is still open and unedited; it answers whether it did. Refuses a turn a reading may be holding. */
export async function makeTaskAsWritten(
  uid: string,
  encryption: HelmEncryption,
  capture: OpenCapture,
) {
  const { waitingCaptures } = store.getState().helm;
  const current = waitingCaptures.captures.find(
    (entry) => entry.id === capture.id,
  );
  if (!current) throw new Error('This turn is no longer waiting.');
  if (!canMakeTaskAsWritten(current, isSorting(capture.id), Date.now())) {
    throw new Error('This turn is being read.');
  }
  const joined = selectAllCaptures(store.getState()).filter(
    (entry) =>
      entry.turnLeadId === current.id &&
      current.joinedCaptureIds.includes(entry.id),
  );
  const title = toTaskTitle(
    [current, ...joined].map((entry) => entry.text).join('\n'),
  );
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
    sourceCaptureId: current.id,
    executionId: null,
    createdAt: now,
    lastEditedAt: null,
    completedAt: null,
    clearedAt: null,
    sealed: await sealJson<TaskSealed>(
      { title, notes: null, steps: {} },
      encryption,
    ),
  };
  const openQuestionIds = Object.entries(current.questionState)
    .filter(([, question]) => question.answeredAt === null)
    .map(([id]) => id);
  const questionFields = (answeredAt: number | null) =>
    Object.fromEntries(
      openQuestionIds.map((id) => [
        `questionState.${id}.answeredAt`,
        answeredAt,
      ]),
    );
  const captureRef = doc(capturesOf(uid), current.id);
  const taskRef = doc(tasksOf(uid));
  const batch = writeBatch(db);
  batch.set(taskRef, task);
  batch.update(captureRef, {
    status: 'sorted',
    sortedAt: now,
    seenAt: now,
    ...questionFields(now),
  });
  const waitingJoined = joined.filter((entry) => entry.status === 'received');
  waitingJoined.forEach((entry) =>
    batch.update(doc(capturesOf(uid), entry.id), {
      status: 'sorted',
      sortedAt: now,
      claimId: null,
      claimedAt: null,
    }),
  );
  const write = batch.commit();
  const undo = async () => {
    const task = store
      .getState()
      .helm.openTasks.items.find((entry) => entry.id === taskRef.id);
    if (!task || task.status !== 'open' || task.lastEditedAt !== null) {
      return false;
    }
    const { helm } = store.getState();
    const known = [
      ...helm.recentCaptures.captures,
      ...helm.earlier.captures,
    ].find((entry) => entry.id === current.id);
    const stored = known ?? (await getDoc(captureRef)).data();
    if (stored?.status !== 'sorted' || stored.sortedAt !== now) return false;
    const reverse = writeBatch(db);
    reverse.delete(taskRef);
    reverse.update(captureRef, {
      status: current.status,
      sortedAt: current.sortedAt,
      seenAt: current.seenAt,
      ...questionFields(null),
    });
    waitingJoined.forEach((entry) =>
      reverse.update(doc(capturesOf(uid), entry.id), {
        status: 'received',
        sortedAt: null,
      }),
    );
    await reverse.commit();
    return true;
  };
  return { write, undo };
}
