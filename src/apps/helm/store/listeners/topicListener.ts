import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { TOPICS_LIMIT, TOPIC_VERSIONS_LIMIT } from '@apps/helm/constants';
import type {
  OpenTopic,
  OpenTopicVersion,
  Topic,
  TopicDepth,
  TopicSealed,
  TopicSection,
  TopicSource,
  TopicVersion,
  TopicVersionSealed,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your topics did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

const toDepth = (value: unknown): TopicDepth =>
  value === 2 || value === 3 ? value : 1;

const toOverviewOf = (value: unknown): Record<string, number> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]),
        ),
      )
    : {};

const toLevel = (value: unknown): TopicSection['level'] =>
  value === 1 || value === 3 ? value : 2;

const toSource = (value: unknown): TopicSource[] => {
  const source = value as Partial<Record<string, unknown>> | null;
  if (typeof source !== 'object' || source === null) return [];
  const { kind } = source;
  if (kind === 'person' && typeof source.at === 'number')
    return [{ kind, at: source.at }];
  if (kind === 'message' && typeof source.captureId === 'string')
    return [
      {
        kind,
        captureId: source.captureId,
        at: typeof source.at === 'number' ? source.at : 0,
      },
    ];
  if (kind === 'file' && typeof source.mediaId === 'string')
    return [{ kind, mediaId: source.mediaId, noteId: toText(source.noteId) }];
  if (
    (kind === 'note' || kind === 'general') &&
    typeof source.noteId === 'string'
  )
    return [{ kind, noteId: source.noteId }];
  return [];
};

/** Sections open with every field present, so a legacy or half-written one never breaks the document. */
const toSections = (value: unknown): TopicSection[] =>
  Array.isArray(value)
    ? value.flatMap((entry: Partial<TopicSection> | null, index) =>
        entry && typeof entry === 'object'
          ? [
              {
                id: toText(entry.id) ?? `section-${index}`,
                heading: toText(entry.heading),
                level: toLevel(entry.level),
                markdown: toText(entry.markdown) ?? '',
                writtenBy:
                  entry.writtenBy === 'person'
                    ? ('person' as const)
                    : ('nomos' as const),
                sources: Array.isArray(entry.sources)
                  ? entry.sources.flatMap(toSource)
                  : [],
              },
            ]
          : [],
      )
    : [];

/** A topic that won't open is skipped, so a half-written one never shows as a blank row. */
async function openTopic(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenTopic | null> {
  const data = entry.data() as Partial<Topic>;
  try {
    if (!data.sealed) return null;
    const payload = await read<Partial<TopicSealed>>(data.sealed);
    return {
      id: entry.id,
      parentId: data.parentId ?? null,
      depth: toDepth(data.depth),
      projectIds: toIds(data.projectIds),
      version: data.version ?? 0,
      docState: data.docState ?? 'empty',
      pendingNoteIds: toIds(data.pendingNoteIds),
      writeClaim: data.writeClaim ?? null,
      overviewOf: toOverviewOf(data.overviewOf),
      createdBy: data.createdBy ?? 'person',
      executionId: data.executionId ?? null,
      createdAt: data.createdAt ?? 0,
      lastEditedAt: data.lastEditedAt ?? null,
      lastWrittenAt: data.lastWrittenAt ?? null,
      name: toText(payload.name) ?? '',
      emoji: toText(payload.emoji),
      overview: toText(payload.overview),
      sections: toSections(payload.sections),
      isUnreadable: false,
    };
  } catch {
    return null;
  }
}

/** Every topic the person has, up to the cap. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startTopicsListener(
  uid: string,
  read: SealedReader,
  onChange: (topics: OpenTopic[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'topics'),
      limit(TOPICS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openTopic(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.filter((topic): topic is OpenTopic => topic !== null));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

async function openVersion(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenTopicVersion | null> {
  const data = entry.data() as Partial<TopicVersion>;
  try {
    if (!data.sealed) return null;
    const payload = await read<Partial<TopicVersionSealed>>(data.sealed);
    return {
      id: entry.id,
      version: data.version ?? Number(entry.id),
      restoredFromVersion: data.restoredFromVersion ?? null,
      createdBy: data.createdBy === 'person' ? 'person' : 'nomos',
      reason: data.reason ?? 'addedFromSource',
      noteIds: toIds(data.noteIds),
      sourceCaptureId: data.sourceCaptureId ?? null,
      executionId: data.executionId ?? null,
      createdAt: data.createdAt ?? 0,
      sections: toSections(payload.sections),
      changeSummary: toText(payload.changeSummary) ?? '',
      requestQuote: toText(payload.requestQuote),
      parentName: toText(payload.parentName),
    };
  } catch {
    return null;
  }
}

/** One topic's versions, newest first. Started only while History is open. */
export function startTopicVersionsListener(
  uid: string,
  topicId: string,
  read: SealedReader,
  onChange: (versions: OpenTopicVersion[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(
        db,
        'apps',
        'helm',
        'users',
        uid,
        'topics',
        topicId,
        'versions',
      ),
      orderBy('version', 'desc'),
      limit(TOPIC_VERSIONS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openVersion(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(
        opened.filter(
          (version): version is OpenTopicVersion => version !== null,
        ),
      );
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
