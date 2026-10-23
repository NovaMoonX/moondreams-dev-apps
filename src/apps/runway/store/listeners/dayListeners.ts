import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openJson } from '@apps/runway/security';
import type {
  DayOverrideSealed,
  IncomeDayDoc,
  OpenDay,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

async function openDay(
  entry: IncomeDayDoc,
  encryption: RunwayEncryption,
): Promise<OpenDay> {
  const opened = entry.sealed
    ? await openJson<Partial<DayOverrideSealed>>(entry.sealed, encryption)
    : null;
  const result: OpenDay = {
    id: entry.id,
    payLineId: entry.payLineId,
    sourceId: entry.sourceId ?? null,
    expectedOn: entry.expectedOn,
    status: entry.status,
    override: {
      pairings: opened?.pairings ?? null,
      holdResolutions: opened?.holdResolutions ?? {},
    },
  };
  return result;
}

/** The days from `from` on that the person has changed. Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startDaysListener(
  uid: string,
  encryption: RunwayEncryption,
  from: number,
  onChange: (days: OpenDay[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'days'),
      where('expectedOn', '>=', from),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openDay(
              { ...(entry.data() as IncomeDayDoc), id: entry.id },
              encryption,
            ),
          ),
        );
        if (mine === sequence.latest) onChange(opened);
      } catch (error) {
        if (mine === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    sequence.latest += 1;
    stop();
  };
}
