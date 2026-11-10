import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { HELM_CAPS } from '@apps/helm/constants';
import type { KeyDate, KeyDateSealed } from '@apps/helm/types';
import { toMoment, type WhoMoment } from '@apps/helm/utils/moments';

const datesOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'keyDates');

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your moments did not open.');

/** A moment that won't open is left out: with no words there is nothing to show. */
async function openMoment(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<WhoMoment[]> {
  const data = entry.data() as Partial<KeyDate>;
  if (!data.sealed) return [];
  try {
    const sealed = await read<Partial<KeyDateSealed>>(data.sealed);
    const moment = toMoment(entry.id, data, sealed);
    return moment ? [moment] : [];
  } catch {
    return [];
  }
}

/** One who's moments, all at most the cap. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startMomentsListener(
  uid: string,
  whoId: string,
  read: SealedReader,
  onChange: (moments: WhoMoment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const stop = onSnapshot(
    query(
      datesOf(uid),
      where('whoId', '==', whoId),
      where('shape', '==', 'moment'),
      limit(HELM_CAPS.momentsPerWho),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openMoment(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.flat());
    },
    (error) => onError(toError(error)),
  );
  return () => {
    run.isStopped = true;
    stop();
  };
}
