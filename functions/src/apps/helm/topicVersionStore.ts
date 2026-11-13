import type { DocumentReference, Transaction } from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import {
  MAX_VERSIONS,
  versionsToDelete,
  type DocState,
  type TopicSection,
  type VersionReason,
} from './topicWrite.js';

const MAX_DELETES = 400;

export interface TopicDoc {
  parentId: string | null;
  depth: number;
  docState: DocState;
  version: number;
  pendingNoteIds: string[];
  writeClaim: { claimId: string; at: number } | null;
  overviewOf: Record<string, number>;
  sealed: SealedPayload;
}

export const toIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const toDocState = (value: unknown): DocState =>
  value === 'current' ||
  value === 'behind' ||
  value === 'writing' ||
  value === 'failed'
    ? value
    : 'empty';

export const toTopicDoc = (data: Record<string, unknown>): TopicDoc => {
  const claim = data.writeClaim as { claimId?: unknown; at?: unknown } | null;
  return {
    parentId: typeof data.parentId === 'string' ? data.parentId : null,
    depth: typeof data.depth === 'number' ? data.depth : 1,
    docState: toDocState(data.docState),
    version: typeof data.version === 'number' ? data.version : 0,
    pendingNoteIds: toIds(data.pendingNoteIds),
    writeClaim:
      claim && typeof claim.claimId === 'string' && typeof claim.at === 'number'
        ? { claimId: claim.claimId, at: claim.at }
        : null,
    overviewOf:
      typeof data.overviewOf === 'object' && data.overviewOf !== null
        ? (data.overviewOf as Record<string, number>)
        : {},
    sealed: data.sealed as SealedPayload,
  };
};

export const toSections = (words: Record<string, unknown>): TopicSection[] =>
  Array.isArray(words.sections) ? (words.sections as TopicSection[]) : [];

/** The numbers of the versions a topic keeps, read before any write of the transaction. */
export const readVersionNumbers = async (
  transaction: Transaction,
  topicRef: DocumentReference,
) =>
  (await transaction.get(topicRef.collection('versions').select())).docs.map(
    (doc) => Number(doc.id),
  );

export interface VersionWrite {
  topicRef: DocumentReference;
  currentVersion: number;
  existingVersions: number[];
  currentWords: Record<string, unknown>;
  sections: TopicSection[];
  reason: VersionReason;
  noteIds: string[];
  sourceCaptureId: string | null;
  executionId: string;
  changeSummary: string;
  requestQuote: string | null;
  parentName: string | null;
  docState: DocState;
  pendingNoteIds: string[];
  /** Other fields of the topic the same write sets, such as its new place in the tree. */
  topicFields?: Record<string, unknown>;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}

/** The one place a server version is written: the topic's new document, its version record and the oldest versions past the cap, all in the caller's transaction. It clears the write claim, so a caller refuses a live one first. */
export const writeTopicVersionIn = (
  transaction: Transaction,
  input: VersionWrite,
): number => {
  const version = input.currentVersion + 1;
  transaction.update(input.topicRef, {
    sealed: input.seal({ ...input.currentWords, sections: input.sections }),
    version,
    docState: input.docState,
    pendingNoteIds: input.pendingNoteIds,
    writeClaim: null,
    lastWrittenAt: input.now,
    ...input.topicFields,
  });
  transaction.set(input.topicRef.collection('versions').doc(String(version)), {
    version,
    restoredFromVersion: null,
    createdBy: 'nomos',
    reason: input.reason,
    noteIds: input.noteIds,
    sourceCaptureId: input.sourceCaptureId,
    executionId: input.executionId,
    createdAt: input.now,
    sealed: input.seal({
      sections: input.sections,
      changeSummary: input.changeSummary,
      requestQuote: input.requestQuote,
      parentName: input.parentName,
    }),
  });
  versionsToDelete([...input.existingVersions, version], MAX_VERSIONS)
    .slice(0, MAX_DELETES)
    .forEach((old) =>
      transaction.delete(
        input.topicRef.collection('versions').doc(String(old)),
      ),
    );
  return version;
};

/** A topic as a turn's transaction read it, its words opened. */
export interface LiveTopic {
  id: string;
  name: string;
  version: number;
  docState: DocState;
  pendingNoteIds: string[];
  writeClaim: { claimId: string; at: number } | null;
  parentId: string | null;
  depth: number;
  sections: TopicSection[];
  /** Everything sealed in the document, to write back whole with new sections. */
  words: Record<string, unknown>;
}

/** Opens a topic document; null when its words will not open. */
export const openLiveTopic = (
  key: HelmKey,
  id: string,
  data: Record<string, unknown>,
): LiveTopic | null => {
  try {
    const topic = toTopicDoc(data);
    const words = openForHelm(key, topic.sealed);
    return typeof words.name === 'string' && words.name !== ''
      ? {
          id,
          name: words.name,
          version: topic.version,
          docState: topic.docState,
          pendingNoteIds: topic.pendingNoteIds,
          writeClaim: topic.writeClaim,
          parentId: topic.parentId,
          depth: topic.depth,
          sections: toSections(words),
          words,
        }
      : null;
  } catch {
    return null;
  }
};
