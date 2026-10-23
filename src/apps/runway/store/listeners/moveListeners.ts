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
  BillPaidSealed,
  MoveDoc,
  OpenMove,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

async function openMove(
  entry: MoveDoc,
  encryption: RunwayEncryption,
): Promise<OpenMove> {
  const payload = await openJson<BillPaidSealed>(entry.sealed, encryption);
  return {
    id: entry.id,
    kind: entry.kind,
    date: entry.date,
    refId: entry.refId ?? null,
    reversesMoveId: entry.reversesMoveId ?? null,
    createdAt: entry.createdAt,
    payload,
  };
}

/** The ledger entries dated from `from` on. Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startMovesListener(
  uid: string,
  encryption: RunwayEncryption,
  from: number,
  onChange: (moves: OpenMove[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'moves'),
      where('date', '>=', from),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs
            .map((entry) => ({ ...(entry.data() as MoveDoc), id: entry.id }))
            .filter((entry) => entry.kind === 'billPaid')
            .map((entry) => openMove(entry, encryption)),
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
