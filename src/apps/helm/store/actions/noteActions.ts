import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils';
import {
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  NOTE_TOPICS_MAX,
  NOTES_LIMIT,
} from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  Note,
  NoteSealed,
  OpenTopic,
  Sealed,
  Topic,
} from '@apps/helm/types';

const notesOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'notes');
const topicsOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'topics');

const capturesOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'captures');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

/** What a person writes in a note: the words and the topics it is filed under. */
export interface NoteWords {
  title: string;
  body: string;
  topicIds: string[];
}

const toWords = (words: NoteWords): NoteWords => ({
  title: words.title.trim().slice(0, NOTE_TITLE_MAX),
  body: words.body.trim().slice(0, NOTE_BODY_MAX),
  topicIds: Array.from(new Set(words.topicIds)),
});

export type NoteRefusal = 'empty' | 'full' | 'tooManyTopics';

export type NoteMade =
  | {
      kind: 'made';
      id: string;
      written: Promise<void>;
      undo: () => Promise<boolean>;
    }
  | { kind: NoteRefusal };

/** Keeps a note written by hand, up to 1,000 notes and 10 topics each. The write is handed back unawaited; Undo deletes it only while it is untouched. */
export async function createNote(
  uid: string,
  encryption: HelmEncryption,
  input: NoteWords,
  noteCount: number,
): Promise<NoteMade> {
  const words = toWords(input);
  if (!words.title && !words.body) return { kind: 'empty' };
  if (noteCount >= NOTES_LIMIT) return { kind: 'full' };
  if (words.topicIds.length > NOTE_TOPICS_MAX) {
    return { kind: 'tooManyTopics' };
  }
  const id = generateUuid();
  const note: Note = {
    topicIds: words.topicIds,
    source: 'typed',
    isFromGeneralAnswer: false,
    checkedAt: null,
    hasHealthCaution: false,
    sourceCaptureId: null,
    sourceMediaId: null,
    projectIds: [],
    createdBy: 'person',
    executionId: null,
    createdAt: Date.now(),
    lastEditedAt: null,
    sealed: await sealJson<NoteSealed>(
      { title: words.title, body: words.body },
      encryption,
    ),
  };
  const ref = doc(notesOf(uid), id);
  return {
    kind: 'made',
    id,
    written: setDoc(ref, note),
    undo: () =>
      runTransaction(db, async (transaction) => {
        const live = await transaction.get(ref);
        if (!live.exists()) return true;
        if ((live.data() as Note).lastEditedAt !== null) return false;
        transaction.delete(ref);
        return true;
      }),
  };
}

export type NoteEdit =
  | { kind: 'saved'; undo: () => Promise<boolean> }
  | {
      kind: 'offline' | 'missing' | 'unreadable' | 'empty' | 'tooManyTopics';
    };

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

/** Changes a note in one transaction that writes only the fields the person changed, so another device's edits are kept. Undo puts back only fields still as this edit left them. Needs a connection. */
export async function editNote(
  uid: string,
  encryption: HelmEncryption,
  noteId: string,
  from: NoteWords,
  to: NoteWords,
): Promise<NoteEdit> {
  if (!navigator.onLine) return { kind: 'offline' };
  const before = toWords(from);
  const after = toWords(to);
  if (!after.title && !after.body) return { kind: 'empty' };
  const ref = doc(notesOf(uid), noteId);
  try {
    return await runTransaction(db, async (transaction): Promise<NoteEdit> => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) return { kind: 'missing' };
      const data = snapshot.data() as Note;
      const opened = await openJson<NoteSealed>(
        data.sealed as Sealed,
        encryption,
      ).catch(() => null);
      if (!opened) return { kind: 'unreadable' };
      const isTitleChanged = after.title !== before.title;
      const isBodyChanged = after.body !== before.body;
      const addedTopics = after.topicIds.filter(
        (id) => !before.topicIds.includes(id),
      );
      const removedTopics = before.topicIds.filter(
        (id) => !after.topicIds.includes(id),
      );
      const isTopicsChanged = addedTopics.length + removedTopics.length > 0;
      const topicIds = [
        ...data.topicIds.filter((id) => !removedTopics.includes(id)),
        ...addedTopics.filter((id) => !data.topicIds.includes(id)),
      ];
      if (topicIds.length > NOTE_TOPICS_MAX) {
        return { kind: 'tooManyTopics' };
      }
      const now = Date.now();
      const sealed =
        isTitleChanged || isBodyChanged
          ? await sealJson<NoteSealed>(
              {
                ...opened,
                ...(isTitleChanged ? { title: after.title } : {}),
                ...(isBodyChanged ? { body: after.body } : {}),
              },
              encryption,
            )
          : null;
      transaction.update(ref, {
        ...(sealed ? { sealed } : {}),
        ...(isTopicsChanged ? { topicIds } : {}),
        checkedAt: now,
        lastEditedAt: now,
      });
      return {
        kind: 'saved',
        undo: () =>
          runTransaction(db, async (undoing) => {
            const live = await undoing.get(ref);
            if (!live.exists()) return false;
            const liveData = live.data() as Note;
            const liveOpened = await openJson<NoteSealed>(
              liveData.sealed as Sealed,
              encryption,
            ).catch(() => null);
            if (!liveOpened) return false;
            const isAsLeft =
              (!isTitleChanged || liveOpened.title === after.title) &&
              (!isBodyChanged || liveOpened.body === after.body) &&
              (!isTopicsChanged || sameIds(liveData.topicIds, topicIds)) &&
              liveData.lastEditedAt === now;
            if (!isAsLeft) return false;
            const restored =
              isTitleChanged || isBodyChanged
                ? await sealJson<NoteSealed>(
                    {
                      ...liveOpened,
                      ...(isTitleChanged ? { title: before.title } : {}),
                      ...(isBodyChanged ? { body: before.body } : {}),
                    },
                    encryption,
                  )
                : null;
            undoing.update(ref, {
              ...(restored ? { sealed: restored } : {}),
              ...(isTopicsChanged ? { topicIds: data.topicIds } : {}),
              checkedAt: data.checkedAt,
              lastEditedAt: data.lastEditedAt,
            });
            return true;
          }),
      };
    });
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

export type NoteRestore = 'restored' | 'exists';

/** Deletes a note. Undo puts it back under its id while the id is free, keeping only the topics that still exist. */
export async function deleteNote(uid: string, noteId: string) {
  const ref = doc(notesOf(uid), noteId);
  const raw = (await getDocFromCache(ref).catch(() => getDoc(ref))).data();
  if (!raw) throw new Error('This note is already gone.');
  const write = deleteDoc(ref);
  const restore = async (): Promise<NoteRestore> => {
    if ((await getDoc(ref)).exists()) return 'exists';
    const topicIds = (raw as Note).topicIds ?? [];
    const kept = (
      await Promise.all(
        topicIds.map(async (id) =>
          (await getDoc(doc(topicsOf(uid), id))).exists() ? [id] : [],
        ),
      )
    ).flat();
    await setDoc(ref, { ...raw, topicIds: kept, lastEditedAt: Date.now() });
    return 'restored';
  };
  return { write, restore };
}

/** A topic's fields once a note joins it: marked behind so its next write re-reads the note, unless it is being written or failed, which keeps its state. */
const withNoteAdded = (state: Topic['docState'], noteId: string) => ({
  docState: state === 'writing' || state === 'failed' ? state : 'behind',
  pendingNoteIds: arrayUnion(noteId),
});

/** A topic's fields once a note leaves it: the pending mark goes, and the topic goes back to current (or empty when never written) only when it was marked behind for nothing else. */
const withNoteRemoved = (topic: Topic, noteId: string) => ({
  pendingNoteIds: arrayRemove(noteId),
  ...(topic.docState === 'behind' &&
  topic.pendingNoteIds.every((id) => id === noteId)
    ? { docState: topic.lastWrittenAt !== null ? 'current' : 'empty' }
    : {}),
});

/** What Save to my knowledge keeps: the question as a title, the general text as the body, and the topic it files under (null leaves it loose). */
export interface SavedAnswerInput {
  captureId: string;
  title: string;
  body: string;
  isHealth: boolean;
  topic: OpenTopic | null;
  noteCount: number;
}

export type AnswerSaved =
  | { kind: 'saved'; noteId: string; written: Promise<void> }
  | { kind: 'empty' | 'full' };

/** Keeps a general answer as a note in one batch with the capture's `answerSavedNoteId` and, when filed, the topic's pending mark. Handed back unawaited so it works offline. */
export async function saveAnswerAsNote(
  uid: string,
  encryption: HelmEncryption,
  input: SavedAnswerInput,
): Promise<AnswerSaved> {
  const words = toWords({ title: input.title, body: input.body, topicIds: [] });
  if (!words.body) return { kind: 'empty' };
  if (input.noteCount >= NOTES_LIMIT) return { kind: 'full' };
  const id = generateUuid();
  const note: Note = {
    topicIds: input.topic ? [input.topic.id] : [],
    source: 'savedAnswer',
    isFromGeneralAnswer: true,
    checkedAt: null,
    hasHealthCaution: input.isHealth,
    sourceCaptureId: input.captureId,
    sourceMediaId: null,
    projectIds: [],
    createdBy: 'person',
    executionId: null,
    createdAt: Date.now(),
    lastEditedAt: null,
    sealed: await sealJson<NoteSealed>(
      { title: words.title, body: words.body },
      encryption,
    ),
  };
  const batch = writeBatch(db);
  batch.set(doc(notesOf(uid), id), note);
  batch.update(doc(capturesOf(uid), input.captureId), {
    answerSavedNoteId: id,
  });
  if (input.topic) {
    batch.update(
      doc(topicsOf(uid), input.topic.id),
      withNoteAdded(input.topic.docState, id),
    );
  }
  return { kind: 'saved', noteId: id, written: batch.commit() };
}

export type SavedAnswerUndo = 'undone' | 'edited' | 'offline';

/** Takes back a saved answer in one transaction: deletes the note only while it is unedited, clears the capture's `answerSavedNoteId` and takes the note out of its topics' pending lists. Needs a connection. */
export async function undoSavedAnswer(
  uid: string,
  captureId: string,
  noteId: string,
): Promise<SavedAnswerUndo> {
  if (!navigator.onLine) return 'offline';
  const noteRef = doc(notesOf(uid), noteId);
  const captureRef = doc(capturesOf(uid), captureId);
  try {
    return await runTransaction(db, async (transaction) => {
      const [noteSnap, captureSnap] = await Promise.all([
        transaction.get(noteRef),
        transaction.get(captureRef),
      ]);
      const note = noteSnap.exists() ? (noteSnap.data() as Note) : null;
      if (note && note.lastEditedAt !== null) return 'edited';
      const topicSnaps = await Promise.all(
        (note?.topicIds ?? []).map((id) =>
          transaction.get(doc(topicsOf(uid), id)),
        ),
      );
      if (captureSnap.exists()) {
        transaction.update(captureRef, { answerSavedNoteId: null });
      }
      if (note) transaction.delete(noteRef);
      topicSnaps
        .filter((snapshot) => snapshot.exists())
        .forEach((snapshot) =>
          transaction.update(
            snapshot.ref,
            withNoteRemoved(snapshot.data() as Topic, noteId),
          ),
        );
      return 'undone';
    });
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export type NoteFiling = 'filed' | 'missing' | 'tooMany' | 'offline';

/** Files a note under exactly these topics in one transaction: only `topicIds` is written on the note (its edit and check marks stay), each topic it joins is marked behind with the note pending, and each it leaves loses the pending mark. Needs a connection. */
export async function fileNoteInTopics(
  uid: string,
  noteId: string,
  topicIds: string[],
): Promise<NoteFiling> {
  if (!navigator.onLine) return 'offline';
  const wanted = Array.from(new Set(topicIds));
  if (wanted.length > NOTE_TOPICS_MAX) return 'tooMany';
  const noteRef = doc(notesOf(uid), noteId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<NoteFiling> => {
        const noteSnap = await transaction.get(noteRef);
        if (!noteSnap.exists()) return 'missing';
        const before = (noteSnap.data() as Note).topicIds;
        const snapshots = await Promise.all(
          Array.from(new Set([...before, ...wanted])).map((id) =>
            transaction.get(doc(topicsOf(uid), id)),
          ),
        );
        const live = new Map(
          snapshots
            .filter((snapshot) => snapshot.exists())
            .map((snapshot) => [snapshot.id, snapshot]),
        );
        const after = wanted.filter((id) => live.has(id));
        if (wanted.length > 0 && after.length === 0) return 'missing';
        transaction.update(noteRef, { topicIds: after });
        after
          .filter((id) => !before.includes(id))
          .forEach((id) => {
            const snapshot = live.get(id);
            if (!snapshot) return;
            transaction.update(
              snapshot.ref,
              withNoteAdded((snapshot.data() as Topic).docState, noteId),
            );
          });
        before
          .filter((id) => !after.includes(id))
          .forEach((id) => {
            const snapshot = live.get(id);
            if (!snapshot) return;
            transaction.update(
              snapshot.ref,
              withNoteRemoved(snapshot.data() as Topic, noteId),
            );
          });
        return 'filed';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

/** Records that the person checked a note saved from a general answer, without counting as an edit. */
export const markNoteChecked = (uid: string, noteId: string) =>
  updateDoc(doc(notesOf(uid), noteId), { checkedAt: Date.now() });
