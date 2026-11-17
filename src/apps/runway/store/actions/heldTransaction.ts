import type { DocumentData, Transaction } from 'firebase/firestore';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import { toHeldWrite, type HeldWrite } from '@/utils/heldWrites';
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

/** What a write lands on: another write's hold, else the list; never this transaction's own earlier attempt. */
const baseOf = (kind: HeldKind, id: string, token: string): Opened | null => {
  const { held, incoming } = store.getState().runway;
  const other = (held[kind] as HeldWrite<Opened>[]).find(
    (hold) => hold.id === id && hold.token !== token,
  );
  if (other !== undefined) return other.item;
  return (incoming[kind] as Opened[]).find((item) => item.id === id) ?? null;
};

const IGNORED = Symbol('ignored');
const UNSHOWABLE = Symbol('unshowable');

const mergeReadable = (
  base: Opened,
  data: DocumentData | null,
): Opened | typeof UNSHOWABLE => {
  if (data === null || !isPlainWrite(data)) return UNSHOWABLE;
  const fields = Object.keys(data);
  if (fields.includes('sealed')) return UNSHOWABLE;
  if (!fields.every((field) => Object.hasOwn(base, field))) return UNSHOWABLE;
  return { ...base, ...data } as Opened;
};

const toItem = async (
  write: RecordedWrite,
  kind: HeldKind,
  id: string,
  base: Opened | null,
  encryption: RunwayEncryption,
): Promise<Opened | null | typeof IGNORED | typeof UNSHOWABLE> => {
  if (write.op === 'delete') return null;
  if (write.op === 'set' && !write.isMerge && write.data !== null) {
    return openFull(kind, id, write.data, encryption).catch(() => UNSHOWABLE);
  }
  if (base === null) return IGNORED;
  return mergeReadable(base, write.data);
};

interface Built {
  kind: HeldKind;
  id: string;
  item: Opened | null;
  fields: string[];
}

/** Each record's state after the attempt's writes, in order; null when any write can't be shown, so none is. */
const buildItems = (
  writes: RecordedWrite[],
  uid: string,
  token: string,
  encryption: RunwayEncryption,
): Promise<Built[] | null> =>
  writes
    .reduce<Promise<Map<string, Built> | null>>(async (pending, write) => {
      const built = await pending;
      const target = readTarget(write.segments, uid);
      if (built === null || target === null) return built;
      const key = `${target.kind}/${target.id}`;
      const earlier = built.get(key);
      const base =
        earlier !== undefined
          ? earlier.item
          : baseOf(target.kind, target.id, token);
      const item = await toItem(
        write,
        target.kind,
        target.id,
        base,
        encryption,
      );
      if (item === UNSHOWABLE) return null;
      if (item === IGNORED) return built;
      const fields =
        item === null
          ? []
          : write.op === 'set' && !write.isMerge
            ? Object.keys(item)
            : Array.from(
                new Set([
                  ...(earlier?.fields ?? []),
                  ...Object.keys(write.data ?? {}),
                ]),
              );
      return new Map(built).set(key, { ...target, item, fields });
    }, Promise.resolve(new Map()))
    .then((built) => (built === null ? null : [...built.values()]));

/** Whether the listeners read this record; one outside their window is never held, since it would never let go. */
const isWatched = (entry: Built, heldDayIds: Set<string>): boolean => {
  const state = store.getState().runway;
  if (entry.item === null) return true;
  if (entry.kind === 'moves') {
    const move = entry.item as OpenMove;
    return (
      move.kind === 'start' ||
      (state.movesFrom !== null && move.date >= state.movesFrom)
    );
  }
  if (entry.kind === 'days') {
    return (
      state.daysFrom !== null &&
      (entry.item as OpenDay).expectedOn >= state.daysFrom
    );
  }
  const { dayId } = entry.item as OpenRecord;
  return (
    heldDayIds.has(dayId) || (state.recordsFor ?? '').split(',').includes(dayId)
  );
};

const isLanded = (token: string) => () => {
  const { held } = store.getState().runway;
  return (['days', 'records', 'moves'] as HeldKind[]).every((kind) =>
    (held[kind] as HeldWrite<Opened>[]).every((hold) => hold.token !== token),
  );
};

/** A Runway transaction whose moves, days and records show at once, go back if it fails, and are watched until the listeners show them. */
export async function runHeldTransaction<T>(
  uid: string,
  body: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const token = generateUuid();
  const encryption = await getRunwayEncryption(uid).catch(() => null);
  const hold = async (writes: RecordedWrite[]) => {
    if (encryption === null) return;
    const built = await buildItems(writes, uid, token, encryption);
    if (built === null) {
      store.dispatch(dropWrites(token));
      return;
    }
    const heldDayIds = new Set(
      built
        .filter(
          (entry) =>
            entry.kind === 'days' &&
            (entry.item as OpenDay | null)?.status === 'confirmed' &&
            isWatched(entry, new Set()),
        )
        .map((entry) => entry.id),
    );
    const input = built
      .filter((entry) => isWatched(entry, heldDayIds))
      .reduce<HeldWritesInput>(
        (sum, { kind, id, item, fields }) => ({
          ...sum,
          [kind]: [...(sum[kind] ?? []), toHeldWrite(id, item, fields, token)],
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
