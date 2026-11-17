import type { DocumentData, Transaction } from 'firebase/firestore';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import { toFingerprint, type HeldWrite } from '@/utils/heldWrites';
import {
  isPlainWrite,
  runRecordedTransaction,
  type RecordedWrite,
} from '@/lib/firebase/recordedTransaction';
import { watchWriteLanded } from '@/lib/firebase/syncWatchdog';
import { createSealedReader } from '@lib/security';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { openJson } from '@apps/runway/security';
import { openDay } from '@apps/runway/store/listeners/dayListeners';
import { openMove, openRecord } from '@apps/runway/store/listeners/openLedger';
import {
  dropWrites,
  holdWrites,
  settleWrites,
  type HeldKind,
  type HeldWritesInput,
} from '@apps/runway/store/runwaySlice';
import type {
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  OpenDay,
  OpenMove,
  OpenRecord,
  RunwayEncryption,
} from '@apps/runway/types';

type Opened = OpenDay | OpenRecord | OpenMove;

/** `apps/runway/plans/{uid}/moves/{id}`, `…/days/{id}` and `…/days/{dayId}/records/{id}`. */
const readTarget = (
  segments: string[],
  uid: string,
): { kind: HeldKind; id: string } | null => {
  const [apps, runway, plans, owner, ...rest] = segments;
  if (apps !== 'apps' || runway !== 'runway' || plans !== 'plans') return null;
  if (owner !== uid) return null;
  if (rest.length === 2 && rest[0] === 'moves')
    return { kind: 'moves', id: rest[1] };
  if (rest.length === 2 && rest[0] === 'days')
    return { kind: 'days', id: rest[1] };
  if (rest.length === 4 && rest[0] === 'days' && rest[2] === 'records') {
    return { kind: 'records', id: rest[3] };
  }
  return null;
};

const openFull = (
  kind: HeldKind,
  id: string,
  data: DocumentData,
  encryption: RunwayEncryption,
): Promise<Opened> => {
  const read = createSealedReader(encryption, openJson);
  if (kind === 'moves') return openMove({ ...(data as MoveDoc), id }, read);
  if (kind === 'days') return openDay({ ...(data as IncomeDayDoc), id }, read);
  return openRecord({ ...(data as DayRecordDoc), id }, encryption);
};

const currentOf = (kind: HeldKind, id: string): Opened | undefined =>
  (store.getState().runway[kind] as Opened[]).find((item) => item.id === id);

const baselineOf = (kind: HeldKind, id: string): string | null => {
  const delivered = (store.getState().runway.incoming[kind] as Opened[]).find(
    (item) => item.id === id,
  );
  return delivered === undefined ? null : toFingerprint(delivered);
};

/** A partial write is laid over the shown record only when every field it names is a plain, readable one the record carries. */
const mergeReadable = (
  kind: HeldKind,
  id: string,
  data: DocumentData | null,
): Opened | null => {
  const current = currentOf(kind, id);
  if (current === undefined || !isPlainWrite(data) || data === null)
    return null;
  const fields = Object.keys(data);
  if (fields.includes('sealed')) return null;
  if (!fields.every((field) => Object.hasOwn(current, field))) return null;
  return { ...current, ...data } as Opened;
};

const toHold = async (
  write: RecordedWrite,
  uid: string,
  token: string,
  encryption: RunwayEncryption,
): Promise<{ kind: HeldKind; hold: HeldWrite<Opened> } | null> => {
  const target = readTarget(write.segments, uid);
  if (target === null) return null;
  const { kind, id } = target;
  const item =
    write.op === 'delete'
      ? null
      : write.op === 'set' && !write.isMerge && write.data !== null
        ? await openFull(kind, id, write.data, encryption).catch(
            () => undefined,
          )
        : mergeReadable(kind, id, write.data);
  if (item === undefined || (item === null && write.op !== 'delete'))
    return null;
  return {
    kind,
    hold: {
      id,
      item,
      fingerprint: item === null ? '' : toFingerprint(item),
      token,
      settledAt: null,
      baseline: baselineOf(kind, id),
    },
  };
};

/** Whether the listeners read this record; one outside their window (a day not read) is never held, since it would never let go. */
const isWatched = (kind: HeldKind, hold: HeldWrite<Opened>): boolean => {
  const state = store.getState().runway;
  if (hold.item === null) return true;
  if (kind === 'moves') {
    const move = hold.item as OpenMove;
    return (
      move.kind === 'start' ||
      (state.movesFrom !== null && move.date >= state.movesFrom)
    );
  }
  if (kind === 'days') {
    return (
      state.daysFrom !== null &&
      (hold.item as OpenDay).expectedOn >= state.daysFrom
    );
  }
  return (state.recordsFor ?? '')
    .split(',')
    .includes((hold.item as OpenRecord).dayId);
};

const isLanded = (token: string) => () => {
  const { held } = store.getState().runway;
  return (['days', 'records', 'moves'] as HeldKind[]).every((kind) =>
    (held[kind] as HeldWrite<Opened>[]).every((hold) => hold.token !== token),
  );
};

/**
 * Runs a Runway transaction whose moves, days and records show on screen before the server answers,
 * go back if it fails, and are watched until the listeners show them.
 */
export async function runHeldTransaction<T>(
  uid: string,
  body: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const token = generateUuid();
  const encryption = await getRunwayEncryption(uid).catch(() => null);
  const hold = async (writes: RecordedWrite[]) => {
    if (encryption === null) return;
    const holds = (
      await Promise.all(
        writes.map((write) => toHold(write, uid, token, encryption)),
      )
    )
      .filter((entry) => entry !== null)
      .filter((entry) => isWatched(entry.kind, entry.hold));
    const input = holds.reduce<HeldWritesInput>(
      (sum, entry) => ({
        ...sum,
        [entry.kind]: [...(sum[entry.kind] ?? []), entry.hold],
      }),
      { token },
    );
    store.dispatch(holdWrites(input));
  };
  try {
    const result = await runRecordedTransaction(body, hold);
    store.dispatch(settleWrites(token));
    void watchWriteLanded({
      feature: 'Runway',
      what: 'a change to your plan',
      hasLanded: isLanded(token),
    });
    return result;
  } catch (error) {
    store.dispatch(dropWrites(token));
    throw error;
  }
}
