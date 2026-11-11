import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import { MAX_HINT_NOTES } from './nomos/commands.js';
import type { ContextNote, ContextTopic } from './nomos/buildContext.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TOPICS_READ = 100;

const toDocState = (value: unknown) =>
  value === 'empty' ||
  value === 'current' ||
  value === 'behind' ||
  value === 'writing' ||
  value === 'failed'
    ? value
    : 'empty';

export interface OpenTopicRecord extends ContextTopic {
  parentId: string | null;
  docState: 'empty' | 'current' | 'behind' | 'writing' | 'failed';
  pendingNoteIds: string[];
}

/** Opens a topic document; null when its words will not open. */
export const openTopicRecord = (
  key: HelmKey,
  id: string,
  data: Record<string, unknown>,
): Omit<OpenTopicRecord, 'path'> | null => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    if (typeof words.name !== 'string' || words.name === '') return null;
    return {
      id,
      name: words.name,
      parentId: typeof data.parentId === 'string' ? data.parentId : null,
      docState: toDocState(data.docState),
      pendingNoteIds: Array.isArray(data.pendingNoteIds)
        ? data.pendingNoteIds.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [],
    };
  } catch {
    return null;
  }
};

const toPath = (
  id: string,
  byId: Map<string, Omit<OpenTopicRecord, 'path'>>,
  seen: ReadonlySet<string> = new Set(),
): string[] => {
  const topic = byId.get(id);
  return !topic || seen.has(id)
    ? []
    : [
        ...(topic.parentId
          ? toPath(topic.parentId, byId, new Set([...seen, id]))
          : []),
        topic.name,
      ];
};

/** The person's topics (at most 100, one query) with each one's path from the top down, for the model to file a note under. A failed read is logged and leaves the turn without topics. */
export async function readContextTopics(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  max: number = MAX_TOPICS_READ,
): Promise<OpenTopicRecord[]> {
  try {
    const docs = (await firestore.collection(`${base}/topics`).limit(max).get())
      .docs;
    const opened = docs.flatMap((doc) => {
      const topic = openTopicRecord(key, doc.id, doc.data());
      return topic ? [topic] : [];
    });
    const byId = new Map(opened.map((topic) => [topic.id, topic]));
    return opened.map((topic) => ({
      ...topic,
      path: toPath(topic.id, byId).join(' › '),
    }));
  } catch (error) {
    logger.warn('helm.sort.topicsUnreadable', {
      cause: error instanceof Error ? error.name : 'error',
    });
    return [];
  }
}

export interface HintedNote extends ContextNote {
  body: string;
}

/** The notes the device ranked for what was typed, opened under the caller's own uid: ids that are not ids, repeats, missing and unreadable notes are dropped and at most 8 are kept. A failed read is logged and leaves the turn without hints. */
export async function readHintedNotes(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  noteIds: string[],
): Promise<HintedNote[]> {
  const wanted = [...new Set(noteIds.filter((id) => ID_RE.test(id)))].slice(
    0,
    MAX_HINT_NOTES,
  );
  if (wanted.length === 0) return [];
  try {
    const snapshots = await firestore.getAll(
      ...wanted.map((id) => firestore.doc(`${base}/notes/${id}`)),
    );
    return snapshots.flatMap((snapshot): HintedNote[] => {
      const data = snapshot.data();
      if (!data) return [];
      try {
        const words = openForHelm(key, data.sealed as SealedPayload);
        return typeof words.title === 'string' && typeof words.body === 'string'
          ? [{ id: snapshot.id, title: words.title, body: words.body }]
          : [];
      } catch {
        return [];
      }
    });
  } catch (error) {
    logger.warn('helm.sort.hintedNotesUnreadable', {
      cause: error instanceof Error ? error.name : 'error',
    });
    return [];
  }
}
