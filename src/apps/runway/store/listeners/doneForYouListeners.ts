import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@lib/security';

import { DONE_FOR_YOU_DAYS, MAX_DONE_FOR_YOU } from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import { openJson } from '@apps/runway/security';
import type {
  DoneForYouDoc,
  DoneForYouSealed,
  OpenDoneForYou,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Done for you did not open.');

/** The last 30 days of what the app did on its own, newest first. An entry that will not open is left out; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startDoneForYouListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (entries: OpenDoneForYou[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'doneForYou'),
      where('createdAt', '>=', Date.now() - DONE_FOR_YOU_DAYS * DAY_MS),
      orderBy('createdAt', 'desc'),
      limit(MAX_DONE_FOR_YOU),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenDoneForYou | null> => {
            const data = entry.data() as DoneForYouDoc;
            try {
              return {
                ...(await read<DoneForYouSealed>(data.sealed)),
                id: entry.id,
                kind: data.kind,
                createdAt: data.createdAt,
                undoneAt: data.undoneAt ?? null,
              };
            } catch {
              return null;
            }
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened.filter((entry) => entry !== null));
      } catch (error) {
        if (current === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
