import {
  collection,
  onSnapshot,
  query,
  where,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { MOVE_KINDS } from '@apps/runway/constants';
import { openJson } from '@apps/runway/security';
import type {
  BillPaidSealed,
  MoveDoc,
  OpenMove,
  RunwayEncryption,
  StartSealed,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

async function openMove(
  entry: MoveDoc,
  encryption: RunwayEncryption,
): Promise<OpenMove> {
  const base = {
    id: entry.id,
    date: entry.date,
    refId: entry.refId ?? null,
    reversesMoveId: entry.reversesMoveId ?? null,
    createdAt: entry.createdAt,
  };
  if (entry.kind === 'start') {
    const payload = await openJson<StartSealed>(entry.sealed, encryption);
    return { ...base, kind: 'start', payload };
  }
  const payload = await openJson<BillPaidSealed>(entry.sealed, encryption);
  return { ...base, kind: 'billPaid', payload };
}

const KNOWN_KINDS: readonly string[] = MOVE_KINDS;

/**
 * The ledger entries dated from `from` on, and every starting holding whatever its date. Each snapshot
 * is opened before the two are delivered together; a slow open never overwrites a newer snapshot or lands
 * after the listener stopped.
 */
export function startMovesListener(
  uid: string,
  encryption: RunwayEncryption,
  from: number,
  onChange: (moves: OpenMove[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const run = { isStopped: false };
  const parts: { recent: OpenMove[] | null; start: OpenMove[] | null } = {
    recent: null,
    start: null,
  };
  const movesPath = collection(db, 'apps', 'runway', 'plans', uid, 'moves');

  const deliver = () => {
    if (!parts.recent || !parts.start) return;
    const byId = new Map(
      [...parts.recent, ...parts.start].map((move) => [move.id, move]),
    );
    onChange([...byId.values()]);
  };

  const listen = (source: Query, key: 'recent' | 'start'): Unsubscribe => {
    const mine = { latest: 0 };
    return onSnapshot(
      source,
      async (snapshot) => {
        mine.latest += 1;
        const current = mine.latest;
        try {
          const opened = await Promise.all(
            snapshot.docs
              .map((entry) => ({ ...(entry.data() as MoveDoc), id: entry.id }))
              .filter((entry) => KNOWN_KINDS.includes(entry.kind))
              .map((entry) => openMove(entry, encryption)),
          );
          if (current !== mine.latest || run.isStopped) return;
          parts[key] = opened;
          deliver();
        } catch (error) {
          if (current === mine.latest) onError(toError(error));
        }
      },
      (error) => onError(toError(error)),
    );
  };

  const stops = [
    listen(query(movesPath, where('date', '>=', from)), 'recent'),
    listen(query(movesPath, where('kind', '==', 'start')), 'start'),
  ];

  return () => {
    run.isStopped = true;
    stops.forEach((stop) => stop());
  };
}
