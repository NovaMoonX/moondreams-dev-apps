import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader, type SealedReader } from '@apps/runway/security';
import { openRecord } from '@apps/runway/store/listeners/openLedger';
import type {
  DayOverrideSealed,
  DayRecordDoc,
  IncomeDayDoc,
  OpenDay,
  OpenRecord,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

async function openDay(
  entry: IncomeDayDoc,
  read: SealedReader,
): Promise<OpenDay> {
  const opened = entry.sealed
    ? await read<Partial<DayOverrideSealed>>(entry.sealed)
    : null;
  const result: OpenDay = {
    id: entry.id,
    payLineId: entry.payLineId,
    sourceId: entry.sourceId ?? null,
    expectedOn: entry.expectedOn,
    arrivedOn: entry.arrivedOn ?? null,
    confirmedAt: entry.confirmedAt ?? null,
    status: entry.status,
    doneLineIds: entry.doneLineIds ?? [],
    override: {
      pairings: opened?.pairings ?? null,
      holdResolutions: opened?.holdResolutions ?? {},
      payloads: opened?.payloads ?? {},
    },
  };
  return result;
}

/** The days from `from` on (before `to` when it is given) that the person has changed. Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startDaysListener(
  uid: string,
  encryption: RunwayEncryption,
  from: number,
  onChange: (days: OpenDay[]) => void,
  onError: (error: Error) => void,
  to: number | null = null,
): Unsubscribe {
  const sequence = { latest: 0 };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'days'),
      where('expectedOn', '>=', from),
      ...(to === null ? [] : [where('expectedOn', '<', to)]),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openDay({ ...(entry.data() as IncomeDayDoc), id: entry.id }, read),
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

/**
 * The records of the given confirmed days, one listener per day because the records live under the
 * day. Records are never edited, so a snapshot is the whole story of its day; each day's records are
 * delivered once they are all opened, and the callback gets every day read so far.
 */
export function startRecordsListener(
  uid: string,
  encryption: RunwayEncryption,
  dayIds: readonly string[],
  onChange: (records: OpenRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const state = { byDay: new Map<string, OpenRecord[]>(), isStopped: false };
  const sequences = new Map<string, number>();

  const stops = dayIds.map((dayId) =>
    onSnapshot(
      collection(db, 'apps', 'runway', 'plans', uid, 'days', dayId, 'records'),
      async (snapshot) => {
        const mine = (sequences.get(dayId) ?? 0) + 1;
        sequences.set(dayId, mine);
        try {
          const opened = await Promise.all(
            snapshot.docs.map((entry) =>
              openRecord(
                { ...(entry.data() as DayRecordDoc), id: entry.id },
                encryption,
              ),
            ),
          );
          if (state.isStopped || sequences.get(dayId) !== mine) return;
          state.byDay.set(dayId, opened);
          if (state.byDay.size < dayIds.length) return;
          onChange([...state.byDay.values()].flat());
        } catch (error) {
          if (!state.isStopped && sequences.get(dayId) === mine) {
            onError(toError(error));
          }
        }
      },
      (error) => onError(toError(error)),
    ),
  );
  if (dayIds.length === 0) onChange([]);

  return () => {
    state.isStopped = true;
    stops.forEach((stop) => stop());
  };
}
