import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  type DocumentData,
  getDoc,
  getDocFromCache,
  runTransaction,
  setDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils';
import { NOTE_TOPICS_MAX, TOPIC_NAME_MAX } from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  Note,
  OpenNote,
  OpenTopic,
  Sealed,
  Topic,
  TopicDepth,
  TopicSealed,
} from '@apps/helm/types';
import {
  createRefusal,
  depthAfterMove,
  liftChildren,
  moveRefusal,
  subtreeOf,
  type CreateRefusal,
  type MoveRefusal,
  type TopicPlacement,
} from '@apps/helm/utils/topicTree';

const CHUNK = 400;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const topicsOf = (uid: string) => collection(userOf(uid), 'topics');
const notesOf = (uid: string) => collection(userOf(uid), 'notes');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

const toChunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) =>
    items.slice(index * CHUNK, (index + 1) * CHUNK),
  );

const toDepth = (depth: number): TopicDepth =>
  depth >= 3 ? 3 : depth <= 1 ? 1 : 2;

/** The words a person sets when they make or rename a topic. */
export interface TopicWords {
  name: string;
  emoji: string | null;
}

const toWords = (words: TopicWords): TopicWords => ({
  name: words.name.trim().slice(0, TOPIC_NAME_MAX),
  emoji: words.emoji || null,
});

export type TopicMade =
  | { kind: 'made'; id: string; written: Promise<void> }
  | { kind: 'empty' | 'offline' | CreateRefusal };

/** Makes a topic, at the top or under another. Refused past 100 topics, 20 subtopics in one or three levels. A top-level one is handed back unawaited so it works offline; a subtopic re-reads its parent in a transaction (its depth may have changed) and needs a connection. */
export async function createTopic(
  uid: string,
  encryption: HelmEncryption,
  input: TopicWords & { parentId: string | null },
  topics: OpenTopic[],
): Promise<TopicMade> {
  const words = toWords(input);
  if (!words.name) return { kind: 'empty' };
  const refusal = createRefusal(input.parentId, topics);
  if (refusal) return { kind: refusal };
  const id = generateUuid();
  const ref = doc(topicsOf(uid), id);
  const make = async (depth: TopicDepth): Promise<Topic> => ({
    parentId: input.parentId,
    depth,
    projectIds: [],
    version: 0,
    docState: 'empty',
    pendingNoteIds: [],
    writeClaim: null,
    overviewOf: {},
    createdBy: 'person',
    executionId: null,
    createdAt: Date.now(),
    lastEditedAt: null,
    lastWrittenAt: null,
    sealed: await sealJson<TopicSealed>(
      { name: words.name, emoji: words.emoji, overview: null, sections: [] },
      encryption,
    ),
  });
  if (input.parentId === null) {
    return { kind: 'made', id, written: setDoc(ref, await make(1)) };
  }
  if (!navigator.onLine) return { kind: 'offline' };
  const parentRef = doc(topicsOf(uid), input.parentId);
  try {
    return await runTransaction(db, async (transaction): Promise<TopicMade> => {
      const parent = await transaction.get(parentRef);
      const depth = parent.exists() ? (parent.data() as Topic).depth : null;
      if (depth === null) return { kind: 'missing' };
      if (depth >= 3) return { kind: 'tooDeep' };
      transaction.set(ref, await make(toDepth(depth + 1)));
      return { kind: 'made', id, written: Promise.resolve() };
    });
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

export type TopicRename = 'saved' | 'offline' | 'missing' | 'unreadable';

/** Changes a topic's name and emoji, re-reading it in a transaction so its document and anything changed on another device meanwhile are kept. Needs a connection. */
export async function renameTopic(
  uid: string,
  encryption: HelmEncryption,
  topicId: string,
  edit: TopicWords,
): Promise<TopicRename> {
  if (!navigator.onLine) return 'offline';
  const words = toWords(edit);
  const ref = doc(topicsOf(uid), topicId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<TopicRename> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const opened = await openJson<TopicSealed>(
          (snapshot.data() as Topic).sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        transaction.update(ref, {
          sealed: await sealJson<TopicSealed>(
            { ...opened, name: words.name, emoji: words.emoji },
            encryption,
          ),
          lastEditedAt: Date.now(),
        });
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export type TopicMove =
  | { kind: 'moved'; undo: () => Promise<TopicMove> }
  | { kind: 'offline' | 'missing' | 'changed' | MoveRefusal };

/** Moves a topic, with every topic under it, in one transaction. It re-reads the topic, its subtopics and the new parent, refuses when any is no longer as the caller saw it, checks the move again with the topic tree and writes the new parent and every depth. Undo moves it back under the same rule. Needs a connection. */
export async function moveTopic(
  uid: string,
  topicId: string,
  parentId: string | null,
  topics: OpenTopic[],
): Promise<TopicMove> {
  if (!navigator.onLine) return { kind: 'offline' };
  const refusal = moveRefusal(topicId, parentId, topics);
  if (refusal) return { kind: refusal };
  const subtree = subtreeOf(topicId, topics);
  const watched = [
    ...subtree,
    ...(parentId === null
      ? []
      : topics.filter((topic) => topic.id === parentId)),
  ];
  const placements = depthAfterMove(topicId, parentId, topics);
  const before = topics.find((topic) => topic.id === topicId)?.parentId ?? null;
  try {
    return await runTransaction(db, async (transaction): Promise<TopicMove> => {
      const snapshots = await Promise.all(
        watched.map((topic) => transaction.get(doc(topicsOf(uid), topic.id))),
      );
      const isAsSeen = snapshots.every((snapshot, index) => {
        const live = snapshot.data() as Topic | undefined;
        return (
          live !== undefined &&
          live.parentId === watched[index].parentId &&
          live.depth === watched[index].depth
        );
      });
      if (!isAsSeen) return { kind: 'changed' };
      const now = Date.now();
      placements.forEach((placement) =>
        transaction.update(doc(topicsOf(uid), placement.id), {
          ...(placement.id === topicId ? { parentId } : {}),
          depth: placement.depth,
          lastEditedAt: now,
        }),
      );
      return {
        kind: 'moved',
        undo: () =>
          moveTopic(
            uid,
            topicId,
            before,
            topics.map((topic) => {
              const placed = placements.find((entry) => entry.id === topic.id);
              return placed
                ? {
                    ...topic,
                    parentId: placed.parentId,
                    depth: toDepth(placed.depth),
                  }
                : topic;
            }),
          ),
      };
    });
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

export class TopicDeletePartialError extends Error {
  constructor() {
    super('Some notes may have lost this topic.');
  }
}

export type TopicRestore = 'restored' | 'exists';

/** Re-adds a topic id to the notes that still exist, skipping one that already holds ten topics. */
const refile = (uid: string, topicId: string, noteIds: string[]) =>
  toChunks(noteIds).reduce(
    (chain, chunk) =>
      chain.then(() =>
        runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((id) => transaction.get(doc(notesOf(uid), id))),
          );
          snapshots
            .filter(
              (snapshot) =>
                snapshot.exists() &&
                (snapshot.data() as Note).topicIds.length < NOTE_TOPICS_MAX,
            )
            .forEach((snapshot) =>
              transaction.update(snapshot.ref, {
                topicIds: arrayUnion(topicId),
              }),
            );
        }),
      ),
    Promise.resolve(),
  );

/** Deletes a topic, keeping every note: each note drops the topic and stays loose or in its other topics, each subtopic takes the deleted topic's parent and every topic under them is one level shallower. Chunks of 400 re-read what they touch, notes first and the topic last, so a failure never deletes the topic while notes still name it. Undo puts the topic back, re-files the notes that still exist and moves the subtopics back under it only where each is still as the delete left it. Needs a connection. */
export async function deleteTopic(
  uid: string,
  topicId: string,
  topics: OpenTopic[],
  notes: OpenNote[],
) {
  const ref = doc(topicsOf(uid), topicId);
  const topic = topics.find((entry) => entry.id === topicId);
  if (!topic) throw new Error('This is already gone.');
  const raw = (await getDocFromCache(ref).catch(() => getDoc(ref))).data() as
    DocumentData | undefined;
  if (!raw) throw new Error('This is already gone.');
  const lifted = liftChildren(topicId, topics);
  const before = new Map(
    subtreeOf(topicId, topics).map((entry) => [
      entry.id,
      { parentId: entry.parentId, depth: entry.depth },
    ]),
  );
  const cut: string[] = [];
  const abandon = async (reason: unknown): Promise<never> => {
    await refile(uid, topicId, cut).catch((error: unknown) => {
      console.error('Helm topic links were not put back', error);
      throw new TopicDeletePartialError();
    });
    throw reason;
  };
  const noteIds = notes
    .filter((note) => note.topicIds.includes(topicId))
    .map((note) => note.id);
  try {
    await toChunks(noteIds).reduce(
      (chain, chunk) =>
        chain.then(async () => {
          const done = await runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              chunk.map((id) => transaction.get(doc(notesOf(uid), id))),
            );
            return snapshots.flatMap((snapshot) => {
              if (
                !snapshot.exists() ||
                !(snapshot.data() as Note).topicIds.includes(topicId)
              ) {
                return [];
              }
              transaction.update(snapshot.ref, {
                topicIds: arrayRemove(topicId),
              });
              return [snapshot.id];
            });
          });
          cut.push(...done);
        }),
      Promise.resolve(),
    );
    await runTransaction(db, async (transaction) => {
      const snapshots = await Promise.all(
        [topicId, ...lifted.map((entry) => entry.id)].map((id) =>
          transaction.get(doc(topicsOf(uid), id)),
        ),
      );
      const isAsSeen = snapshots.every((snapshot) => {
        const live = snapshot.data() as Topic | undefined;
        const seen = before.get(snapshot.id);
        return (
          live !== undefined &&
          seen !== undefined &&
          live.parentId === seen.parentId &&
          live.depth === seen.depth
        );
      });
      if (!isAsSeen) throw new Error('This topic changed. Try again.');
      const now = Date.now();
      lifted.forEach((entry) =>
        transaction.update(doc(topicsOf(uid), entry.id), {
          parentId: entry.parentId,
          depth: entry.depth,
          lastEditedAt: now,
        }),
      );
      transaction.delete(ref);
    });
  } catch (error) {
    await abandon(error);
  }
  const restoreChildren = (placements: TopicPlacement[]) =>
    runTransaction(db, async (transaction) => {
      const snapshots = await Promise.all(
        placements.map((entry) =>
          transaction.get(doc(topicsOf(uid), entry.id)),
        ),
      );
      snapshots.forEach((snapshot, index) => {
        const live = snapshot.data() as Topic | undefined;
        const after = placements[index];
        const seen = before.get(after.id);
        if (
          live &&
          seen &&
          live.parentId === after.parentId &&
          live.depth === after.depth
        ) {
          transaction.update(snapshot.ref, {
            parentId: seen.parentId,
            depth: seen.depth,
            lastEditedAt: Date.now(),
          });
        }
      });
    });
  return {
    noteCount: cut.length,
    restore: async (): Promise<TopicRestore> => {
      const isBack = await runTransaction(db, async (transaction) => {
        if ((await transaction.get(ref)).exists()) return false;
        transaction.set(ref, { ...raw, lastEditedAt: Date.now() });
        return true;
      });
      if (!isBack) return 'exists';
      await restoreChildren(lifted);
      await refile(uid, topicId, cut);
      return 'restored';
    },
  };
}
