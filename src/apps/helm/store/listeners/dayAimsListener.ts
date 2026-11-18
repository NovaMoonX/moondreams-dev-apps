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
  DayAims,
  DayAimsSealed,
  OpenDayAims,
  Sealed,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your day did not open.');

/** What a document made before a field lacks is read as that field's empty value. */
export async function openDayAims(
  entry: Pick<QueryDocumentSnapshot, 'id' | 'data'>,
  read: SealedReader,
): Promise<OpenDayAims> {
  const data = entry.data() as Partial<DayAims> & { sealed?: Sealed };
  const base = {
    id: entry.id,
    date: data.date ?? 0,
    state: data.state ?? 'open',
    windDownState: data.windDownState ?? 'waiting',
    lookAt: data.lookAt ?? null,
    rolledAt: data.rolledAt ?? null,
  } as const;
  if (!data.sealed) {
    return { ...base, aims: [], windDown: {}, isUnreadable: false };
  }
  try {
    const payload = await read<Partial<DayAimsSealed>>(data.sealed);
    return {
      ...base,
      aims: (payload.aims ?? []).map((aim) => ({
        ...aim,
        lengthIsGuess: aim.lengthIsGuess ?? false,
        broughtFrom: aim.broughtFrom ?? null,
      })),
      windDown: Object.fromEntries(
        Object.entries(payload.windDown ?? {}).map(([taskId, entry]) => [
          taskId,
          {
            ...entry,
            choice: entry.choice ?? null,
            reason: entry.reason ?? null,
            saidSpanId: entry.saidSpanId ?? null,
          },
        ]),
      ),
      isUnreadable: false,
    };
  } catch {
    return { ...base, aims: [], windDown: {}, isUnreadable: true };
  }
}

/** The days' aims whose date falls from `fromDate` to `toDate` (date-only, UTC midnight). A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startDayAimsListener(
  uid: string,
  read: SealedReader,
  window: { fromDate: number; toDate: number },
  onChange: (days: OpenDayAims[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'dayAims'),
      where('date', '>=', window.fromDate),
      where('date', '<=', window.toDate),
    ),
    async (snapshot) => {
      // An empty cache read says nothing yet about the server's days.
      if (snapshot.empty && snapshot.metadata.fromCache) return;
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openDayAims(entry, read)),
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
