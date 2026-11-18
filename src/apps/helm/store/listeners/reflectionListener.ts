import {
  collection,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import type {
  OpenReflection,
  Reflection,
  ReflectionSealed,
} from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Last night did not open.');

/** A reflection that won't open is left out; the device marks seen only what it weighed. */
export async function openReflection(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenReflection[]> {
  const data = entry.data() as Partial<Reflection>;
  if (!data.sealed) return [];
  try {
    const payload = await read<Partial<ReflectionSealed>>(data.sealed);
    return [
      {
        id: entry.id,
        dayKey: data.dayKey ?? entry.id,
        reflectionId: data.reflectionId ?? '',
        candidateCount: data.candidateCount ?? 0,
        seenAt: data.seenAt ?? null,
        sourceKeys: data.sourceKeys ?? [],
        createdAt: data.createdAt ?? 0,
        privacy: readPrivacy(data.privacy),
        candidates: payload.candidates ?? [],
        whyRefresh: payload.whyRefresh ?? [],
      },
    ];
  } catch {
    return [];
  }
}

/** The nightly pass's reflections the daily check has not weighed yet. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startReflectionsListener(
  uid: string,
  read: SealedReader,
  onChange: (reflections: OpenReflection[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'reflections'),
      where('seenAt', '==', null),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openReflection(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.flat().sort((a, b) => a.dayKey.localeCompare(b.dayKey)));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
