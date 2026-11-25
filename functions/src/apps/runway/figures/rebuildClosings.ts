import { createHash } from 'node:crypto';

import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  buildClosings,
  decodeClosing,
  encodeClosing,
  getLastClosableMonth,
  getMonthStart,
  getNextMonth,
  getRebuildRange,
  getValidClosing,
  listMonths,
  type ClosingEntries,
  type ClosingState,
} from '../engine/closings.js';
import {
  CLOSING_REBUILD_ATTEMPTS,
  CLOSING_WRITE_CHUNK,
} from '../engine/engineConstants.js';
import { openMonthEntries } from '../engine/monthEntries.js';
import type { ReadSealed } from '../engine/openDocs.js';
import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import {
  openWithKey,
  sealWithKey,
  type SealedPayload,
  type unwrapPlanKey,
} from '../planKey.js';
import type {
  ClosingDoc,
  ClosingSealed,
  DateOnly,
  PlanDoc,
} from '../runwayTypes.js';
import { MINUTE_MS } from './reworkState.js';

type PlanKey = Awaited<ReturnType<typeof unwrapPlanKey>>;

/** Months one run rebuilds at most; each chunk moves `dirtyFrom` forward, so the write it makes marks the plan and the next run goes on. */
export const SERVER_REBUILD_MONTHS = 24;

/** How long a rebuild may keep starting chunks when its caller names no deadline. */
const DEFAULT_BUDGET_MS = 2 * MINUTE_MS;

const planPath = (uid: string) => `apps/runway/plans/${uid}`;

const hashOf = (uid: string) =>
  createHash('sha256').update(uid).digest('hex').slice(0, 12);

/** The plan's `updatedAt` moved under a chunk: another device or run wrote first. */
export class PlanMovedError extends Error {
  override name = 'PlanMovedError';
}

/** The newest closing the phone would read (before `dirtyFrom` when set), decoded; one that will not open is none. */
export async function readClosing(
  firestore: Firestore,
  uid: string,
  dirtyFrom: string | null,
  key: Buffer,
): Promise<ClosingState | null> {
  const collection = firestore.collection(`${planPath(uid)}/closings`);
  const snapshot = await (
    dirtyFrom === null ? collection : collection.where('month', '<', dirtyFrom)
  )
    .orderBy('month', 'desc')
    .limit(1)
    .get();
  const entry = snapshot.docs[0];
  if (!entry) return null;
  try {
    const sealed = openWithKey(
      key,
      entry.get('sealed') as SealedPayload,
    ) as unknown as ClosingSealed;
    return decodeClosing(entry.get('month') as string, sealed);
  } catch {
    return null;
  }
}

/** One month of the ledger, read with the Admin SDK by the same dates the phone reads it by and opened by the shared engine reader. */
async function readMonth(
  firestore: Firestore,
  uid: string,
  read: ReadSealed,
  startDate: DateOnly,
  billIds: ReadonlySet<string>,
  month: string,
): Promise<ClosingEntries> {
  const from = getMonthStart(month);
  const to = getMonthStart(getNextMonth(month));
  const under = (name: string) =>
    firestore.collection(`${planPath(uid)}/${name}`);
  const [days, moves, purchases] = await Promise.all([
    under('days')
      .where('expectedOn', '>=', from)
      .where('expectedOn', '<', to)
      .get(),
    under('moves').where('date', '>=', from).where('date', '<', to).get(),
    under('purchases').where('date', '>=', from).where('date', '<', to).get(),
  ]);
  return openMonthEntries(
    {
      days: days.docs,
      moves: moves.docs,
      purchases: purchases.docs,
      getRecords: async (dayId) =>
        (await under(`days/${dayId}/records`).get()).docs,
    },
    read,
    startDate,
    billIds,
  );
}

/** One transaction that writes some closings and moves `dirtyFrom`, refused when the plan's `updatedAt` is no longer the one read. */
async function commit(
  firestore: Firestore,
  uid: string,
  stamp: { value: number },
  closings: readonly ClosingDoc[],
  dirtyFrom: string | null,
  staleAfter: string | null,
) {
  const planRef = firestore.doc(planPath(uid));
  const collection = firestore.collection(`${planPath(uid)}/closings`);
  const stale: DocumentReference[] =
    staleAfter === null
      ? []
      : (await collection.where('month', '>', staleAfter).get()).docs.map(
          (entry) => entry.ref,
        );
  stamp.value = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(planRef);
    const current = snapshot.data() as Partial<PlanDoc> | undefined;
    if (!snapshot.exists || (current?.updatedAt ?? 0) !== stamp.value) {
      throw new PlanMovedError();
    }
    closings.forEach((entry) =>
      transaction.set(collection.doc(entry.id), entry),
    );
    stale.forEach((ref) => transaction.delete(ref));
    const updatedAt = Math.max(Date.now(), stamp.value + 1);
    transaction.update(planRef, { dirtyFrom, updatedAt });
    return updatedAt;
  });
}

export interface RebuildOptions {
  /** Epoch ms after which no new chunk starts; the next run resumes from the `dirtyFrom` the last chunk left. */
  deadline?: number;
}

/**
 * Brings the closings up to date on the server exactly as the phone's `rebuildClosings` does: the same months,
 * the same sealed closings and the same guarded transactions (each checks the plan's `updatedAt`, writes up to
 * six closings, moves `dirtyFrom` forward and raises `updatedAt`), so a phone and a run racing never both commit.
 * At most `SERVER_REBUILD_MONTHS` per call, stopping between chunks past the deadline; true once whole.
 */
export async function rebuildClosingsOnServer(
  firestore: Firestore,
  key: PlanKey,
  uid: string,
  today: DateOnly,
  options: RebuildOptions = {},
): Promise<boolean> {
  const deadline = options.deadline ?? Date.now() + DEFAULT_BUDGET_MS;
  const read: ReadSealed = async <T extends object>(sealed: unknown) =>
    openWithKey(key.key, sealed as SealedPayload) as T;
  const progress = { fromMonth: null as string | null };

  const attempt = async (): Promise<boolean> => {
    const snapshot = await firestore.doc(planPath(uid)).get();
    if (!snapshot.exists) return true;
    const plan = snapshot.data() as Partial<PlanDoc>;
    const startDate = plan.startDate ?? null;
    const dirtyFrom = plan.dirtyFrom ?? null;
    const valid = getValidClosing({
      startDate,
      dirtyFrom,
      closing: await readClosing(firestore, uid, dirtyFrom, key.key),
    });
    const target = getLastClosableMonth(today);
    const range = getRebuildRange({
      startDate,
      dirtyFrom,
      validMonth: valid?.month ?? null,
      target,
    });
    progress.fromMonth = range?.from ?? dirtyFrom;
    if (range === null && dirtyFrom === null) return true;
    const stamp = { value: plan.updatedAt ?? 0 };
    const allMonths = range === null ? [] : listMonths(range.from, range.to);
    const months = allMonths.slice(0, SERVER_REBUILD_MONTHS);
    const isWhole = months.length === allMonths.length;
    const billIds =
      months.length === 0
        ? new Set<string>()
        : new Set(
            (
              await firestore
                .collection(`${planPath(uid)}/items`)
                .where('kind', '==', 'bill')
                .select()
                .get()
            ).docs.map((entry) => entry.id),
          );
    const readOne = (month: string) =>
      startDate === null
        ? Promise.reject(new Error('A plan with no start has no months.'))
        : readMonth(firestore, uid, read, startDate, billIds, month);
    const toDoc = (state: ClosingState): ClosingDoc => ({
      id: state.month,
      month: state.month,
      createdAt: Date.now(),
      sealed: sealWithKey(
        key,
        { ...encodeClosing(state) },
        SEALED_SCHEMA_VERSION,
      ),
    });

    const step = async (
      rest: readonly string[],
      previous: ClosingState | null,
    ): Promise<boolean> => {
      if (rest.length > 0 && Date.now() >= deadline) {
        logger.info('runway.closings.paused', {
          uidHash: hashOf(uid),
          resumesFrom: rest[0],
        });
        return false;
      }
      const chunk = rest.slice(0, CLOSING_WRITE_CHUNK);
      const later = rest.slice(chunk.length);
      const built =
        chunk.length === 0 ? [] : await buildClosings(chunk, previous, readOne);
      const isLast = isWhole && later.length === 0;
      await commit(
        firestore,
        uid,
        stamp,
        built.map(toDoc),
        isLast ? null : getNextMonth(chunk[chunk.length - 1]),
        isLast ? target : null,
      );
      if (later.length === 0) return isLast;
      return step(later, built.at(-1) ?? previous);
    };
    return step(months, valid);
  };

  const run = async (triesLeft: number): Promise<boolean> => {
    try {
      return await attempt();
    } catch (error) {
      if (error instanceof PlanMovedError && triesLeft > 1) {
        return run(triesLeft - 1);
      }
      const code = (error as { code?: unknown } | null)?.code;
      logger.warn(
        error instanceof PlanMovedError
          ? 'runway.closings.moved'
          : 'runway.closings.failed',
        {
          uidHash: hashOf(uid),
          fromMonth: progress.fromMonth,
          errorName: error instanceof Error ? error.name : typeof error,
          code:
            typeof code === 'string' || typeof code === 'number' ? code : null,
        },
      );
      throw error;
    }
  };
  return run(CLOSING_REBUILD_ATTEMPTS);
}
