import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  runTransaction,
  where,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import {
  CLOSING_REBUILD_ATTEMPTS,
  CLOSING_WRITE_CHUNK,
} from '@apps/runway/constants';
import {
  buildClosings,
  encodeClosing,
  getDirtyFrom,
  getLastClosableMonth,
  getMonthStart,
  getNextMonth,
  getRebuildRange,
  getValidClosing,
  listMonths,
  type ClosingState,
} from '@apps/runway/engine/closings';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { sealJson } from '@apps/runway/security';
import {
  closingsCollection,
  newestClosingQuery,
  openClosing,
} from '@apps/runway/store/listeners/closingListeners';
import { openMonthEntries } from '@apps/runway/store/listeners/openLedger';
import type {
  ClosingDoc,
  DateOnly,
  PlanDoc,
  RunwayEncryption,
} from '@apps/runway/types';

const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const planCollection = (uid: string, name: string) =>
  collection(db, 'apps', 'runway', 'plans', uid, name);

/**
 * What a ledger write adds to the plan document: `dirtyFrom` moved back to the earliest closed month
 * among `dates`, and an `updatedAt` that always moves with it, which is what tells a rebuild in flight
 * that the ledger changed under it. `plan` is the plan document read earlier in the same transaction and
 * `dates` are the days the entry is dated on, before and after the write; null when no closing could
 * have summed any of them. Every write that adds, changes or removes a day, a bill paid, a purchase or
 * the starting day goes through here, or its closing would quietly stay as it was.
 */
export function getLedgerMark(
  plan: Partial<PlanDoc> | undefined,
  dates: readonly (DateOnly | null)[],
): { dirtyFrom: string | null; updatedAt: number } | null {
  const { dirtyFrom, isTouched } = getDirtyFrom(
    plan?.dirtyFrom ?? null,
    dates.filter((date): date is DateOnly => date !== null),
    todayAsUtcDate(),
  );
  const result = isTouched
    ? {
        dirtyFrom,
        updatedAt: Math.max(Date.now(), (plan?.updatedAt ?? 0) + 1),
      }
    : null;
  return result;
}

/** Writes the mark of `getLedgerMark` to the plan document, for a transaction that changes nothing else on it. */
export function markLedgerWrite(
  transaction: Transaction,
  uid: string,
  plan: Partial<PlanDoc> | undefined,
  dates: readonly (DateOnly | null)[],
): void {
  const mark = getLedgerMark(plan, dates);
  if (mark !== null) transaction.update(planRef(uid), mark);
}

class PlanMovedError extends Error {}

/** Reads the plan and the newest closing that applies, from the server. */
async function readStanding(uid: string, encryption: RunwayEncryption) {
  const snapshot = await getDocFromServer(planRef(uid));
  if (!snapshot.exists()) return null;
  const plan = snapshot.data() as Partial<PlanDoc>;
  const dirtyFrom = plan.dirtyFrom ?? null;
  const newest = (await getDocsFromServer(newestClosingQuery(uid, dirtyFrom)))
    .docs[0];
  const closing = newest
    ? await openClosing(
        { ...(newest.data() as ClosingDoc), id: newest.id },
        encryption,
      ).catch(() => null)
    : null;
  const startDate = plan.startDate ?? null;
  const result = {
    startDate,
    dirtyFrom,
    updatedAt: plan.updatedAt ?? 0,
    valid: getValidClosing({ startDate, dirtyFrom, closing }),
  };
  return result;
}

/** One transaction that writes some closings and moves `dirtyFrom`, refused when the plan is no longer as it was read. */
async function commit(
  uid: string,
  stamp: { value: number },
  closings: readonly ClosingDoc[],
  dirtyFrom: string | null,
  staleAfter: string | null,
) {
  const stale =
    staleAfter === null
      ? []
      : (
          await getDocsFromServer(
            query(closingsCollection(uid), where('month', '>', staleAfter)),
          )
        ).docs.map((entry) => entry.ref);
  const next = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(planRef(uid));
    const current = snapshot.data() as Partial<PlanDoc> | undefined;
    if (!snapshot.exists() || (current?.updatedAt ?? 0) !== stamp.value) {
      throw new PlanMovedError();
    }
    closings.forEach((entry) =>
      transaction.set(doc(closingsCollection(uid), entry.id), entry),
    );
    stale.forEach((ref) => transaction.delete(ref));
    const updatedAt = Math.max(Date.now(), stamp.value + 1);
    transaction.update(planRef(uid), { dirtyFrom, updatedAt });
    return updatedAt;
  });
  stamp.value = next;
}

/**
 * Brings the closings up to date: from the first stale or missing month through the last month that
 * may be closed. The months are read from the server (a rebuild never trusts the device's copy), each
 * summed on the one before it, and written a few at a time. Every write is a transaction that checks
 * the plan is still as it was read and moves `dirtyFrom` forward with it, so a ledger write that lands
 * in between is never covered by a closing and a rebuild interrupted halfway resumes where it stopped.
 */
export async function rebuildClosings(
  uid: string,
  encryption: RunwayEncryption,
  billIds: ReadonlySet<string>,
): Promise<void> {
  const attempt = async (): Promise<boolean> => {
    const standing = await readStanding(uid, encryption);
    if (standing === null) return true;
    const target = getLastClosableMonth(todayAsUtcDate());
    const range = getRebuildRange({
      startDate: standing.startDate,
      dirtyFrom: standing.dirtyFrom,
      validMonth: standing.valid?.month ?? null,
      target,
    });
    if (range === null && standing.dirtyFrom === null) return true;
    const stamp = { value: standing.updatedAt };
    const months = range === null ? [] : listMonths(range.from, range.to);
    const startDate = standing.startDate;

    const built: ClosingState[] =
      startDate === null || months.length === 0
        ? []
        : await buildClosings(months, standing.valid, async (month) => {
            const from = getMonthStart(month);
            const to = getMonthStart(getNextMonth(month));
            const [days, moves, purchases] = await Promise.all([
              getDocsFromServer(
                query(
                  planCollection(uid, 'days'),
                  where('expectedOn', '>=', from),
                  where('expectedOn', '<', to),
                ),
              ),
              getDocsFromServer(
                query(
                  planCollection(uid, 'moves'),
                  where('date', '>=', from),
                  where('date', '<', to),
                ),
              ),
              getDocsFromServer(
                query(
                  planCollection(uid, 'purchases'),
                  where('date', '>=', from),
                  where('date', '<', to),
                ),
              ),
            ]);
            return openMonthEntries(
              {
                days: days.docs,
                moves: moves.docs,
                purchases: purchases.docs,
                getRecords: async (dayId) =>
                  (
                    await getDocsFromServer(
                      collection(
                        db,
                        'apps',
                        'runway',
                        'plans',
                        uid,
                        'days',
                        dayId,
                        'records',
                      ),
                    )
                  ).docs,
              },
              encryption,
              startDate,
              billIds,
            );
          });

    const now = Date.now();
    const docs = await Promise.all(
      built.map(async (state): Promise<ClosingDoc> => ({
        id: state.month,
        month: state.month,
        createdAt: now,
        sealed: await sealJson(encodeClosing(state), encryption),
      })),
    );
    const chunks = Array.from(
      { length: Math.max(1, Math.ceil(docs.length / CLOSING_WRITE_CHUNK)) },
      (_, index) =>
        docs.slice(
          index * CLOSING_WRITE_CHUNK,
          (index + 1) * CLOSING_WRITE_CHUNK,
        ),
    );
    await chunks.reduce(async (previous, chunk, index) => {
      await previous;
      const isLast = index === chunks.length - 1;
      await commit(
        uid,
        stamp,
        chunk,
        isLast ? null : getNextMonth(chunk[chunk.length - 1].month),
        isLast ? target : null,
      );
    }, Promise.resolve());
    return true;
  };

  const run = async (triesLeft: number): Promise<void> => {
    try {
      await attempt();
    } catch (error) {
      if (error instanceof PlanMovedError && triesLeft > 1) {
        await run(triesLeft - 1);
        return;
      }
      throw error;
    }
  };
  await run(CLOSING_REBUILD_ATTEMPTS);
}
