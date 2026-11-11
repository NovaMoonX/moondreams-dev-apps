import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  type DocumentData,
  getDoc,
  getDocFromCache,
  getDocs,
  runTransaction,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils';
import {
  CLAIM_MS,
  HELM_COPY,
  NOTE_TOPICS_MAX,
  SECTION_HEADING_MAX,
  SECTION_MARKDOWN_MAX,
  SECTION_SOURCES_MAX,
  TOPIC_DEPTH_MAX,
  TOPIC_DOCUMENT_MAX,
  TOPIC_NAME_MAX,
  TOPIC_SECTIONS_MAX,
} from '@apps/helm/constants';
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
  TopicSection,
  TopicVersion,
  TopicVersionSealed,
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

export const isUnavailable = (error: unknown) =>
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

/** Makes a topic at the top or under another. A top-level one is handed back unawaited; a subtopic re-reads its parent in a transaction and needs a connection. */
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

/** Changes a topic's name and emoji in a transaction, keeping the rest of the document. Needs a connection. */
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

/** Moves a topic and everything under it in one transaction, refusing when any of them or the new parent changed since the caller saw it. Undo moves it back under the same rule. Needs a connection. */
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

export type TopicRestore = 'restored' | 'exists' | 'partial' | 'skipped';

/** Re-adds a topic id to the notes that still exist and returns how many already held ten topics and were skipped. */
const refile = (uid: string, topicId: string, noteIds: string[]) =>
  toChunks(noteIds).reduce(
    (chain, chunk) =>
      chain.then(async (skipped) => {
        const left = await runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((id) => transaction.get(doc(notesOf(uid), id))),
          );
          const existing = snapshots.filter((snapshot) => snapshot.exists());
          const room = existing.filter(
            (snapshot) =>
              (snapshot.data() as Note).topicIds.length < NOTE_TOPICS_MAX,
          );
          room.forEach((snapshot) =>
            transaction.update(snapshot.ref, {
              topicIds: arrayUnion(topicId),
            }),
          );
          return existing.length - room.length;
        });
        return skipped + left;
      }),
    Promise.resolve(0),
  );

/** Removes a topic's versions, which a deleted topic leaves behind. Its Undo does not bring them back. */
async function deleteVersions(uid: string, topicId: string) {
  const versions = await getDocs(
    collection(doc(topicsOf(uid), topicId), 'versions'),
  );
  await toChunks(versions.docs).reduce(
    (chain, chunk) =>
      chain.then(() => {
        const batch = writeBatch(db);
        chunk.forEach((entry) => batch.delete(entry.ref));
        return batch.commit();
      }),
    Promise.resolve(),
  );
}

/** Deletes a topic and keeps every note; each subtopic moves up a level. Notes go first and the topic last, so a failure never deletes a topic notes still name. Undo puts it all back where it is still as the delete left it. Needs a connection. */
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
          cut.push(...chunk);
          await runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              chunk.map((id) => transaction.get(doc(notesOf(uid), id))),
            );
            snapshots
              .filter(
                (snapshot) =>
                  snapshot.exists() &&
                  (snapshot.data() as Note).topicIds.includes(topicId),
              )
              .forEach((snapshot) =>
                transaction.update(snapshot.ref, {
                  topicIds: arrayRemove(topicId),
                }),
              );
          });
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
  await deleteVersions(uid, topicId).catch((error: unknown) =>
    console.error('Helm topic history was not deleted', error),
  );
  const restoreChildren = (placements: TopicPlacement[], shift: number) =>
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
          seen.depth + shift <= TOPIC_DEPTH_MAX &&
          live.parentId === after.parentId &&
          live.depth === after.depth
        ) {
          transaction.update(snapshot.ref, {
            parentId: seen.parentId,
            depth: seen.depth + shift,
            lastEditedAt: Date.now(),
          });
        }
      });
    });
  return {
    noteCount: cut.length,
    restore: async (): Promise<TopicRestore> => {
      const back = await runTransaction(db, async (transaction) => {
        if ((await transaction.get(ref)).exists()) return null;
        const parentId = (raw.parentId as string | null) ?? null;
        const parent =
          parentId === null
            ? null
            : await transaction.get(doc(topicsOf(uid), parentId));
        const parentDepth = parent?.exists()
          ? (parent.data() as Topic).depth
          : null;
        const isOrphan =
          parentId !== null &&
          (parentDepth === null || parentDepth >= TOPIC_DEPTH_MAX);
        const depth = toDepth(
          isOrphan || parentDepth === null ? 1 : parentDepth + 1,
        );
        transaction.set(ref, {
          ...raw,
          ...(isOrphan ? { parentId: null } : {}),
          depth,
          lastEditedAt: Date.now(),
        });
        return { shift: depth - topic.depth };
      });
      if (!back) return 'exists';
      const settle = <T>(step: () => Promise<T>) =>
        step().catch((error: unknown) => {
          console.error('Helm topic was not fully put back', error);
          return null;
        });
      const children = await settle(() => restoreChildren(lifted, back.shift));
      const skipped = await settle(() => refile(uid, topicId, cut));
      if (children === null || skipped === null) return 'partial';
      return skipped > 0 ? 'skipped' : 'restored';
    },
  };
}

export type DocumentChange =
  | 'saved'
  | 'offline'
  | 'missing'
  | 'unreadable'
  | 'changed'
  | 'busy'
  | 'tooMany'
  | 'tooLong'
  | 'first';

/** What a hand-written part is made of. */
export interface SectionWords {
  heading: string | null;
  level: TopicSection['level'];
  markdown: string;
}

interface VersionPlan {
  sections: TopicSection[];
  reason: TopicVersion['reason'];
  restoredFromVersion: number | null;
  changeSummary: string;
}

type VersionStep = VersionPlan | Exclude<DocumentChange, 'saved' | 'offline'>;

/** A topic's version document as the person's device writes it: made by the person, holding every part of the document at that version. */
export async function buildVersionDoc(
  encryption: HelmEncryption,
  input: {
    version: number;
    sections: TopicSection[];
    reason: TopicVersion['reason'];
    restoredFromVersion: number | null;
    changeSummary: string;
    executionId: string | null;
    now: number;
  },
): Promise<TopicVersion> {
  return {
    version: input.version,
    restoredFromVersion: input.restoredFromVersion,
    createdBy: 'person',
    reason: input.reason,
    noteIds: [],
    sourceCaptureId: null,
    executionId: input.executionId,
    createdAt: input.now,
    sealed: await sealJson<TopicVersionSealed>(
      {
        sections: input.sections,
        changeSummary: input.changeSummary.slice(0, 200),
        requestQuote: null,
        parentName: null,
      },
      encryption,
    ),
  };
}

const documentLength = (sections: TopicSection[]) =>
  sections.reduce((total, section) => total + section.markdown.length, 0);

/** Writes the topic's next version in one transaction that re-reads the topic first: `expectedVersion` (when given) must still be its newest, and a write the server is making holds it for 90 seconds. Needs a connection. */
async function writeVersion(
  uid: string,
  encryption: HelmEncryption,
  topicId: string,
  expectedVersion: number | null,
  plan: (
    topic: TopicSealed & { version: number },
    readVersion: (version: number) => Promise<TopicVersionSealed | null>,
  ) => Promise<VersionStep>,
): Promise<DocumentChange> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(topicsOf(uid), topicId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<DocumentChange> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const live = snapshot.data() as Topic;
        if (expectedVersion !== null && live.version !== expectedVersion) {
          return 'changed';
        }
        if (live.writeClaim && Date.now() - live.writeClaim.at < CLAIM_MS) {
          return 'busy';
        }
        const opened = await openJson<TopicSealed>(
          live.sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        const step = await plan(
          { ...opened, version: live.version },
          async (version) => {
            const earlier = await transaction.get(
              doc(ref, 'versions', String(version)),
            );
            return earlier.exists()
              ? await openJson<TopicVersionSealed>(
                  (earlier.data() as TopicVersion).sealed,
                  encryption,
                ).catch(() => null)
              : null;
          },
        );
        if (typeof step === 'string') return step;
        const now = Date.now();
        const version = live.version + 1;
        transaction.update(ref, {
          sealed: await sealJson<TopicSealed>(
            { ...opened, sections: step.sections },
            encryption,
          ),
          version,
          lastEditedAt: now,
        });
        transaction.set(
          doc(ref, 'versions', String(version)),
          await buildVersionDoc(encryption, {
            version,
            sections: step.sections,
            reason: step.reason,
            restoredFromVersion: step.restoredFromVersion,
            changeSummary: step.changeSummary,
            executionId: null,
            now,
          }),
        );
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

const toSectionWords = (words: SectionWords): SectionWords => ({
  heading: words.heading?.trim().slice(0, SECTION_HEADING_MAX) || null,
  level: words.level,
  markdown: words.markdown.trim().slice(0, SECTION_MARKDOWN_MAX),
});

/** Edits one part by hand, or adds a new one at the end when `sectionId` is null. The part becomes the person's own, with a version and a "you wrote this" source. */
export function saveTopicSection(
  uid: string,
  encryption: HelmEncryption,
  topicId: string,
  sectionId: string | null,
  input: SectionWords,
  expectedVersion: number | null = null,
): Promise<DocumentChange> {
  const words = toSectionWords(input);
  return writeVersion(
    uid,
    encryption,
    topicId,
    expectedVersion,
    async (topic) => {
      const at = Date.now();
      const mark = { kind: 'person' as const, at };
      const sections =
        sectionId === null
          ? [
              ...topic.sections,
              {
                id: generateUuid(),
                ...words,
                writtenBy: 'person' as const,
                sources: [mark],
              },
            ]
          : topic.sections.map((section) =>
              section.id === sectionId
                ? {
                    ...section,
                    ...words,
                    writtenBy: 'person' as const,
                    sources: [...section.sources, mark].slice(
                      -SECTION_SOURCES_MAX,
                    ),
                  }
                : section,
            );
      if (
        sectionId !== null &&
        !topic.sections.some((s) => s.id === sectionId)
      ) {
        return 'missing';
      }
      if (sections.length > TOPIC_SECTIONS_MAX) return 'tooMany';
      if (documentLength(sections) > TOPIC_DOCUMENT_MAX) return 'tooLong';
      return {
        sections,
        reason: 'personEdit',
        restoredFromVersion: null,
        changeSummary:
          sectionId === null
            ? HELM_COPY.historySummaryAdded(words.heading)
            : HELM_COPY.historySummaryEdited(words.heading),
      };
    },
  );
}

/** Takes one part out of the document as a new version, so History can bring it back; `expectedVersion` is the newest the caller saw. */
export function removeTopicSection(
  uid: string,
  encryption: HelmEncryption,
  topicId: string,
  sectionId: string,
  expectedVersion: number | null,
): Promise<DocumentChange> {
  return writeVersion(
    uid,
    encryption,
    topicId,
    expectedVersion,
    async (topic) => {
      const removed = topic.sections.find(
        (section) => section.id === sectionId,
      );
      if (!removed) return 'missing';
      return {
        sections: topic.sections.filter((section) => section.id !== sectionId),
        reason: 'personEdit',
        restoredFromVersion: null,
        changeSummary: HELM_COPY.historySummaryRemoved(
          removed.heading || removed.markdown.trim().slice(0, 40),
        ),
      };
    },
  );
}

/** Writes a version's parts again as the newest version; `expectedVersion` is the newest the caller saw. Restoring the newest's predecessor is Undo, which refuses on the first version. */
export function restoreTopicVersion(
  uid: string,
  encryption: HelmEncryption,
  topicId: string,
  expectedVersion: number,
  target: number,
): Promise<DocumentChange> {
  if (target < 1 || target >= expectedVersion) {
    return Promise.resolve(target < 1 ? 'first' : 'changed');
  }
  return writeVersion(
    uid,
    encryption,
    topicId,
    expectedVersion,
    async (_topic, readVersion) => {
      const earlier = await readVersion(target);
      return earlier
        ? {
            sections: earlier.sections,
            reason: 'restored',
            restoredFromVersion: target,
            changeSummary: HELM_COPY.historySummaryRestored(target),
          }
        : 'missing';
    },
  );
}
