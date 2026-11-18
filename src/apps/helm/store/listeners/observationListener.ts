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
  Observation,
  ObservationSealed,
  OpenObservation,
} from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('What you said did not open.');

/** An observation that won't open is left out: with no tags there is nothing to read. */
export async function openObservation(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenObservation[]> {
  const data = entry.data() as Partial<Observation>;
  if (!data.sealed) return [];
  try {
    const payload = await read<Partial<ObservationSealed>>(data.sealed);
    if (!Array.isArray(payload.tags)) return [];
    return [
      {
        id: entry.id,
        subject: data.subject ?? { collection: 'day', id: null },
        dayKey: data.dayKey ?? '',
        at: data.at ?? 0,
        source: data.source ?? 'turn',
        sourceKeys: data.sourceKeys ?? [],
        isCare: data.isCare ?? false,
        writtenBy: data.writtenBy ?? 'turn',
        createdAt: data.createdAt ?? 0,
        privacy: readPrivacy(data.privacy),
        kind: payload.kind ?? 'feeling',
        tags: payload.tags,
        quote: typeof payload.quote === 'string' ? payload.quote : null,
      },
    ];
  } catch {
    return [];
  }
}

/** What was said about a habit, goal, task or the day from `fromDayKey` on (two weeks back). A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startObservationsListener(
  uid: string,
  read: SealedReader,
  fromDayKey: string,
  onChange: (observations: OpenObservation[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'observations'),
      where('dayKey', '>=', fromDayKey),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openObservation(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.flat().sort((a, b) => a.at - b.at));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
