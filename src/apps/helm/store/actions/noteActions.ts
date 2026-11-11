import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  runTransaction,
  setDoc,
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
  Sealed,
} from '@apps/helm/types';

const notesOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'notes');
const topicsOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'topics');

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
      undo: () => Promise<void>;
    }
  | { kind: NoteRefusal };

/** Keeps a note written by hand. At most 1,000 notes (counted from the store) and 10 topics each. The write is handed back unawaited so it works offline; Undo deletes it. */
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
    undo: () => deleteDoc(ref),
  };
}

export type NoteEdit =
  | { kind: 'saved'; undo: () => Promise<boolean> }
  | {
      kind: 'offline' | 'missing' | 'unreadable' | 'empty' | 'tooManyTopics';
    };

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

/** Changes a note in one transaction that re-reads it and writes only the fields the person changed (title, body, topics), so words changed on another device meanwhile are kept. Any hand edit sets `checkedAt`. Undo puts back only the fields still as this edit left them. Needs a connection. */
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

/** Deletes a note. The write is handed back unawaited; Undo puts the same document back under its id while the id is free, keeping only the topics that still exist. */
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
    setDoc(ref, { ...raw, topicIds: kept, lastEditedAt: Date.now() }).catch(
      () => undefined,
    );
    return 'restored';
  };
  return { write, restore };
}
