import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { TOPICS_LIMIT } from '@apps/helm/constants';
import type {
  OpenTopic,
  Topic,
  TopicDepth,
  TopicSealed,
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
      sections: Array.isArray(payload.sections) ? payload.sections : [],
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
