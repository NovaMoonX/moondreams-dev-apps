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

import { MAX_WINDOW_CHANGES } from '@apps/runway/constants';
import { openJson } from '@apps/runway/security';
import type {
  ChangeDoc,
  ChangeSealed,
  OpenChange,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The change log did not open.');

async function openChange(
  entry: ChangeDoc,
  encryption: RunwayEncryption,
): Promise<OpenChange> {
  const base = {
    id: entry.id,
    kind: entry.kind,
    createdAt: entry.createdAt,
    effectiveFrom: entry.effectiveFrom ?? null,
    itemIds: entry.itemIds ?? [],
  };
  try {
    const payload = await openJson<ChangeSealed>(entry.sealed, encryption);
    return {
      ...base,
      summary: payload.summary,
      note: payload.note ?? null,
      move: payload.move
        ? { ...payload.move, isOutside: payload.move.isOutside ?? false }
        : null,
      isUnreadable: false,
    };
  } catch {
    return { ...base, summary: '', note: null, move: null, isUnreadable: true };
  }
}

/**
 * The change log entries made from `from` up to `to`, newest first, for one item or all. An entry that will
 * not open is delivered as unreadable rather than dropped; a slow open never overwrites a newer snapshot
 * or lands after the listener stopped.
 */
export function startChangesListener(
  uid: string,
  encryption: RunwayEncryption,
  window: { from: number; to: number; itemId: string | null },
  onChange: (changes: OpenChange[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const path = collection(db, 'apps', 'runway', 'plans', uid, 'changes');
  const stop = onSnapshot(
    window.itemId === null
      ? query(
          path,
          where('createdAt', '>=', window.from),
          where('createdAt', '<', window.to),
          orderBy('createdAt', 'desc'),
          limit(MAX_WINDOW_CHANGES),
        )
      : query(
          path,
          where('itemIds', 'array-contains', window.itemId),
          where('createdAt', '>=', window.from),
          where('createdAt', '<', window.to),
          orderBy('createdAt', 'desc'),
          limit(MAX_WINDOW_CHANGES),
        ),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openChange(
              { ...(entry.data() as ChangeDoc), id: entry.id },
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
