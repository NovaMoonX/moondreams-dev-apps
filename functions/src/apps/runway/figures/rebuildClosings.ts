import type {
  DocumentData,
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

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
import {
  openMove,
  openPurchase,
  openRecord,
  type ReadSealed,
} from '../engine/openDocs.js';
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
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  PlanDoc,
  PurchaseDoc,
} from '../runwayTypes.js';

type PlanKey = Awaited<ReturnType<typeof unwrapPlanKey>>;

/** Months one run rebuilds at most; each chunk moves `dirtyFrom` forward, so the write it makes marks the plan and the next run goes on. */
export const SERVER_REBUILD_MONTHS = 24;

const CLOSING_MOVE_KINDS: readonly string[] = [
  'billPaid',
  'cardPayment',
  'transfer',
  'costPaid',
];

const planPath = (uid: string) => `apps/runway/plans/${uid}`;

class PlanMovedError extends Error {}

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

const withId = <T>(entry: QueryDocumentSnapshot<DocumentData>) =>
  ({ ...entry.data(), id: entry.id }) as T;

/** One month of the ledger opened into what a closing sums, as the phone's `openMonthEntries` does. */
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
  const [dayDocs, moveDocs, purchaseDocs] = await Promise.all([
    under('days')
      .where('expectedOn', '>=', from)
      .where('expectedOn', '<', to)
      .get(),
    under('moves').where('date', '>=', from).where('date', '<', to).get(),
    under('purchases').where('date', '>=', from).where('date', '<', to).get(),
  ]);
  const days = dayDocs.docs.map((entry) => withId<IncomeDayDoc>(entry));
  const [records, moves, purchases] = await Promise.all([
    Promise.all(
      days
        .filter((day) => day.status === 'confirmed')
        .map(async (day) =>
          Promise.all(
            (await under(`days/${day.id}/records`).get()).docs.map((entry) =>
              openRecord(withId<DayRecordDoc>(entry), read),
            ),
          ),
        ),
    ),
    Promise.all(
      moveDocs.docs
        .map((entry) => withId<MoveDoc>(entry))
        .filter((entry) => CLOSING_MOVE_KINDS.includes(entry.kind))
        .map((entry) => openMove(entry, read)),
    ),
    Promise.all(
      purchaseDocs.docs.map((entry) =>
        openPurchase(withId<PurchaseDoc>(entry), read),
      ),
    ),
  ]);
  return {
    startDate,
    days: days.map((day) => ({
      id: day.id,
      expectedOn: day.expectedOn,
      arrivedOn: day.arrivedOn ?? null,
    })),
    records: records.flat(),
    moves,
    purchases,
    billIds,
  };
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

/**
 * Brings the closings up to date on the server exactly as the phone's `rebuildClosings` does: the same months,
 * the same sealed closings and the same guarded transactions (each checks the plan's `updatedAt`, writes up to
 * six closings, moves `dirtyFrom` forward and raises `updatedAt`), so a phone and a run racing never both commit.
 * At most `SERVER_REBUILD_MONTHS` are built per call; true when the closings reach the last closable month.
 */
export async function rebuildClosingsOnServer(
  firestore: Firestore,
  key: PlanKey,
  uid: string,
  today: DateOnly,
): Promise<boolean> {
  const read: ReadSealed = async <T extends object>(sealed: unknown) =>
    openWithKey(key.key, sealed as SealedPayload) as T;

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

    const built: ClosingState[] =
      startDate === null || months.length === 0
        ? []
        : await buildClosings(months, valid, (month) =>
            readMonth(firestore, uid, read, startDate, billIds, month),
          );

    const now = Date.now();
    const docs = built.map((state): ClosingDoc => ({
      id: state.month,
      month: state.month,
      createdAt: now,
      sealed: sealWithKey(
        key,
        { ...encodeClosing(state) },
        SEALED_SCHEMA_VERSION,
      ),
    }));
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
      const isLast = isWhole && index === chunks.length - 1;
      await commit(
        firestore,
        uid,
        stamp,
        chunk,
        isLast ? null : getNextMonth(chunk[chunk.length - 1].month),
        isLast ? target : null,
      );
    }, Promise.resolve());
    return isWhole;
  };

  const run = async (triesLeft: number): Promise<boolean> => {
    try {
      return await attempt();
    } catch (error) {
      if (error instanceof PlanMovedError && triesLeft > 1) {
        return run(triesLeft - 1);
      }
      throw error;
    }
  };
  return run(CLOSING_REBUILD_ATTEMPTS);
}
