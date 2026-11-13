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

import { NOTES_LIMIT } from '@apps/helm/constants';
import type { Note, NoteSealed, NoteSource, OpenNote } from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your notes did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const SOURCES: readonly NoteSource[] = [
  'typed',
  'capture',
  'savedAnswer',
  'importedFile',
  'assistantDraft',
];

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

/** A note that won't open is skipped, so a half-written one never shows as a blank row. */
async function openNote(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenNote | null> {
  const data = entry.data() as Partial<Note>;
  try {
    if (!data.sealed) return null;
    const payload = await read<Partial<NoteSealed>>(data.sealed);
    return {
      id: entry.id,
      topicIds: toIds(data.topicIds),
      source: SOURCES.find((source) => source === data.source) ?? 'typed',
      isFromGeneralAnswer: data.isFromGeneralAnswer ?? false,
      checkedAt: data.checkedAt ?? null,
      hasHealthCaution: data.hasHealthCaution ?? false,
      sourceCaptureId: data.sourceCaptureId ?? null,
      sourceMediaId: data.sourceMediaId ?? null,
      projectIds: toIds(data.projectIds),
      createdBy: data.createdBy ?? 'person',
      executionId: data.executionId ?? null,
      createdAt: data.createdAt ?? 0,
      lastEditedAt: data.lastEditedAt ?? null,
      title: toText(payload.title) ?? '',
      body: toText(payload.body) ?? '',
      isUnreadable: false,
    };
  } catch {
    return null;
  }
}

/** The person's notes, newest first, up to the cap. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startNotesListener(
  uid: string,
  read: SealedReader,
  onChange: (notes: OpenNote[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'notes'),
      orderBy('createdAt', 'desc'),
      limit(NOTES_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openNote(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.filter((note): note is OpenNote => note !== null));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
