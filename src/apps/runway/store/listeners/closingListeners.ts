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

import { decodeClosing, type ClosingState } from '@apps/runway/engine/closings';
import { openJson } from '@apps/runway/security';
import type {
  ClosingDoc,
  ClosingSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

export const closingsCollection = (uid: string) =>
  collection(db, 'apps', 'runway', 'plans', uid, 'closings');

/** The newest closing before `dirtyFrom` (the newest of all when nothing is dirty), opened. */
export async function openClosing(
  entry: ClosingDoc,
  encryption: RunwayEncryption,
): Promise<ClosingState> {
  const sealed = await openJson<ClosingSealed>(entry.sealed, encryption);
  const result = decodeClosing(entry.month, sealed);
  return result;
}

/** The query that finds it. A single field is both ranged and ordered, so it needs no index. */
export const newestClosingQuery = (uid: string, dirtyFrom: string | null) =>
  dirtyFrom === null
    ? query(closingsCollection(uid), orderBy('month', 'desc'), limit(1))
    : query(
        closingsCollection(uid),
        where('month', '<', dirtyFrom),
        orderBy('month', 'desc'),
        limit(1),
      );

/**
 * Listens for the newest closing that can apply. One that will not open is delivered as none: it is a
 * cache, and the rebuild that follows replaces it. A slow open never overwrites a newer snapshot.
 */
export function startClosingListener(
  uid: string,
  encryption: RunwayEncryption,
  dirtyFrom: string | null,
  onChange: (closing: ClosingState | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  const stop = onSnapshot(
    newestClosingQuery(uid, dirtyFrom),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      const entry = snapshot.docs[0];
      const opened = entry
        ? await openClosing(
            { ...(entry.data() as ClosingDoc), id: entry.id },
            encryption,
          ).catch((error: unknown) => {
            console.error('A closing did not open and will be rebuilt', error);
            return null;
          })
        : null;
      if (mine === sequence.latest) onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    sequence.latest += 1;
    stop();
  };
}
