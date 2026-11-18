import {
  collection,
  onSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { SEEN_AS_KINDS } from '@apps/helm/engine/seenAs';
import type { SeenAsLine, SeenAsSealed } from '@apps/helm/types';

/** A line after its sealed words are opened; one with none to open keeps empty text and is never shown. */
export interface OpenSeenAs extends Omit<SeenAsLine, 'sealed'> {
  id: string;
  line: string;
  basis: string;
  corrected: string | null;
  isUnreadable: boolean;
}

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('How you are seen did not open.');

const toKeys = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((key): key is string => typeof key === 'string')
    : [];

export async function openSeenAs(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenSeenAs> {
  const data = entry.data() as Partial<SeenAsLine>;
  const base = {
    id: entry.id,
    kind: SEEN_AS_KINDS.find((kind) => kind === data.kind) ?? 'tendency',
    state: data.state ?? 'shown',
    sourceKeys: toKeys(data.sourceKeys),
    subjectRefs: toKeys(data.subjectRefs),
    writtenBy: data.writtenBy ?? 'reflection',
    dontDrawFrom: toKeys(data.dontDrawFrom),
    derivedAt: data.derivedAt ?? 0,
    correctedAt: data.correctedAt ?? null,
    removedAt: data.removedAt ?? null,
    privacy: data.privacy ?? null,
    createdAt: data.createdAt ?? 0,
  } as const;
  const empty = {
    ...base,
    line: '',
    basis: '',
    corrected: null,
    isUnreadable: true,
  };
  try {
    if (!data.sealed) return empty;
    const payload = await read<Partial<SeenAsSealed>>(data.sealed);
    return {
      ...base,
      line: typeof payload.line === 'string' ? payload.line : '',
      basis: typeof payload.basis === 'string' ? payload.basis : '',
      corrected:
        typeof payload.corrected === 'string' && payload.corrected !== ''
          ? payload.corrected
          : null,
      isUnreadable: false,
    };
  } catch {
    return empty;
  }
}

/** The person's lines, removed ones included, since a removal is what blocks a re-derived line; a slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startSeenAsListener(
  uid: string,
  read: SealedReader,
  onChange: (lines: OpenSeenAs[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    collection(db, 'apps', 'helm', 'users', uid, 'seenAs'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openSeenAs(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
