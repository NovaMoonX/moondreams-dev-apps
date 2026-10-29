import {
  arrayRemove,
  arrayUnion,
  doc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { MAX_DONE_LINE_IDS } from '@apps/runway/constants';
import { getPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { sealJson } from '@apps/runway/security';
import {
  getLedgerMark,
  markLedgerWrite,
} from '@apps/runway/store/actions/closingActions';
import type {
  BillPaidSealed,
  ChangeDoc,
  ChangeSealed,
  StartHolding,
  StartSealed,
  Cents,
  DateOnly,
  MoveDoc,
  PlanDoc,
  RunwayEncryption,
} from '@apps/runway/types';

const moveRef = (uid: string, moveId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'moves', moveId);

export interface MarkBillPaidInput {
  billId: string;
  /** The due date of the payment being paid. */
  dueOn: DateOnly;
  amountCents: Cents;
  /** What was set aside for it already; the rest comes out of Free to Spend. */
  fundedCents: Cents;
  paidOn: DateOnly;
  /** The card it is charged to; null when it is paid in cash. */
  cardId: string | null;
  /** How many times this payment has been marked before, undone marks included. */
  marks: number;
}

/** How many earlier marks of one payment are looked past when a mark was undone, which the device may not have loaded. */
const MAX_MARK_PROBES = 12;

/**
 * Records a bill as paid, ahead of its due date or on it. The move's id names the bill, the due date
 * and which mark it is: a mark is skipped past when it exists and was undone, so a payment from a month
 * the device has not loaded can be marked again, and a second tap on one that is paid writes nothing.
 */
export async function markBillPaid(
  uid: string,
  encryption: RunwayEncryption,
  input: MarkBillPaidInput,
): Promise<void> {
  const payload: BillPaidSealed = {
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    fromFreeCents: Math.max(0, input.amountCents - input.fundedCents),
    cardId: input.cardId,
  };
  const sealed = await sealJson(payload, encryption);
  const ref = doc(db, 'apps', 'runway', 'plans', uid);
  await runTransaction(db, async (transaction) => {
    const plan = await transaction.get(ref);
    const findOpenMark = async (marks: number): Promise<string | null> => {
      if (marks >= input.marks + MAX_MARK_PROBES) return null;
      const id = getPaidMoveId(input.billId, input.dueOn, marks);
      const existing = await transaction.get(moveRef(uid, id));
      if (!existing.exists()) return id;
      const undone = await transaction.get(moveRef(uid, getUndoMoveId(id)));
      return undone.exists() ? findOpenMark(marks + 1) : null;
    };
    const id = await findOpenMark(input.marks);
    if (id === null) return;
    markLedgerWrite(transaction, uid, plan.data(), [input.dueOn]);
    transaction.set(moveRef(uid, id), {
      id,
      kind: 'billPaid',
      date: input.dueOn,
      refId: input.billId,
      reversesMoveId: null,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
  });
}

/** Undoes a paid mark by appending a move that names it; the mark itself stays in the ledger. */
export async function undoBillPaid(
  uid: string,
  encryption: RunwayEncryption,
  paid: {
    moveId: string;
    billId: string;
    dueOn: DateOnly;
  } & BillPaidSealed,
): Promise<void> {
  const id = getUndoMoveId(paid.moveId);
  const sealed = await sealJson(
    {
      amountCents: paid.amountCents,
      paidOn: paid.paidOn,
      fromFreeCents: paid.fromFreeCents,
      cardId: paid.cardId ?? null,
    } satisfies BillPaidSealed,
    encryption,
  );
  const ref = moveRef(uid, id);
  await runTransaction(db, async (transaction) => {
    const [existing, plan] = await Promise.all([
      transaction.get(ref),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ]);
    if (existing.exists()) return;
    markLedgerWrite(transaction, uid, plan.data(), [paid.dueOn]);
    transaction.set(ref, {
      id,
      kind: 'billPaid',
      date: paid.dueOn,
      refId: paid.billId,
      reversesMoveId: paid.moveId,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
  });
}

/** Bills one transaction marks or unmarks at most, so its rule reads stay under the limit for one request. */
const BILLS_PER_TRANSACTION = 5;

const toChunks = <T>(list: readonly T[]): T[][] =>
  Array.from(
    { length: Math.ceil(list.length / BILLS_PER_TRANSACTION) },
    (_, index) =>
      list.slice(
        index * BILLS_PER_TRANSACTION,
        (index + 1) * BILLS_PER_TRANSACTION,
      ),
  );

export type WrittenPaidMark = {
  moveId: string;
  billId: string;
  dueOn: DateOnly;
} & BillPaidSealed;

/**
 * Marks several payments paid at once, a transaction per few bills that re-reads each payment's marks
 * and skips one already paid, and ticks the checklist lines in the first. Returns the marks it wrote,
 * so an Undo can take back exactly those.
 */
/** A later chunk of a bulk mark failed after earlier chunks were written; `written` holds what did land. */
export class PartlyMarkedError extends Error {
  constructor(
    readonly written: WrittenPaidMark[],
    readonly cause: unknown,
  ) {
    super('Some bills were marked paid before a later write failed.');
  }
}

const runChunk = async <T>(
  before: WrittenPaidMark[],
  write: () => Promise<T>,
): Promise<T> => {
  try {
    const result = await write();
    return result;
  } catch (chunkError) {
    if (before.length === 0) throw chunkError;
    throw new PartlyMarkedError(before, chunkError);
  }
};

export async function markBillsPaid(
  uid: string,
  encryption: RunwayEncryption,
  inputs: readonly MarkBillPaidInput[],
  lines: { dayId: string; lineIds: readonly string[] } | null,
): Promise<WrittenPaidMark[]> {
  const payloads = await Promise.all(
    inputs.map(async (input) => {
      const payload: BillPaidSealed = {
        amountCents: input.amountCents,
        paidOn: input.paidOn,
        fromFreeCents: Math.max(0, input.amountCents - input.fundedCents),
        cardId: input.cardId,
      };
      const sealed = await sealJson(payload, encryption);
      return { input, payload, sealed };
    }),
  );
  const planDoc = doc(db, 'apps', 'runway', 'plans', uid);
  const chunks = payloads.length === 0 ? [[]] : toChunks(payloads);
  const written = await chunks.reduce<Promise<WrittenPaidMark[]>>(
    async (previous, chunk, chunkIndex) => {
      const before = await previous;
      const wrote = await runChunk(before, () =>
        runTransaction(db, async (transaction) => {
          const plan = await transaction.get(planDoc);
          const findOpenMark = async (
            input: MarkBillPaidInput,
            marks: number,
          ): Promise<string | null> => {
            if (marks >= input.marks + MAX_MARK_PROBES) return null;
            const id = getPaidMoveId(input.billId, input.dueOn, marks);
            const existing = await transaction.get(moveRef(uid, id));
            if (!existing.exists()) return id;
            const undone = await transaction.get(
              moveRef(uid, getUndoMoveId(id)),
            );
            return undone.exists() ? findOpenMark(input, marks + 1) : null;
          };
          const ids = await chunk.reduce<Promise<(string | null)[]>>(
            async (found, entry) => [
              ...(await found),
              await findOpenMark(entry.input, entry.input.marks),
            ],
            Promise.resolve([]),
          );
          const open = chunk.flatMap((entry, index) => {
            const id = ids[index];
            return id === null ? [] : [{ ...entry, id }];
          });
          if (open.length > 0) {
            markLedgerWrite(
              transaction,
              uid,
              plan.data(),
              open.map((entry) => entry.input.dueOn),
            );
          }
          open.forEach((entry) =>
            transaction.set(moveRef(uid, entry.id), {
              id: entry.id,
              kind: 'billPaid',
              date: entry.input.dueOn,
              refId: entry.input.billId,
              reversesMoveId: null,
              createdAt: Date.now(),
              sealed: entry.sealed,
            } satisfies MoveDoc),
          );
          if (chunkIndex === 0 && lines !== null && lines.lineIds.length > 0) {
            transaction.update(
              doc(db, 'apps', 'runway', 'plans', uid, 'days', lines.dayId),
              { doneLineIds: arrayUnion(...lines.lineIds) },
            );
          }
          return open.map((entry): WrittenPaidMark => ({
            moveId: entry.id,
            billId: entry.input.billId,
            dueOn: entry.input.dueOn,
            ...entry.payload,
          }));
        }),
      );
      return [...before, ...wrote];
    },
    Promise.resolve([]),
  );
  return written;
}

/** Takes back marks one act wrote, skipping any already taken back, and unticks the lines it ticked. Returns how many it took back. */
export async function undoBillsPaid(
  uid: string,
  encryption: RunwayEncryption,
  marks: readonly WrittenPaidMark[],
  lines: { dayId: string; lineIds: readonly string[] } | null,
): Promise<number> {
  const sealedMarks = await Promise.all(
    marks.map(async (paid) => ({
      paid,
      sealed: await sealJson(
        {
          amountCents: paid.amountCents,
          paidOn: paid.paidOn,
          fromFreeCents: paid.fromFreeCents,
          cardId: paid.cardId ?? null,
        } satisfies BillPaidSealed,
        encryption,
      ),
    })),
  );
  const planDoc = doc(db, 'apps', 'runway', 'plans', uid);
  const chunks = sealedMarks.length === 0 ? [[]] : toChunks(sealedMarks);
  const count = await chunks.reduce<Promise<number>>(
    async (previous, chunk, chunkIndex) => {
      const before = await previous;
      const undone = await runTransaction(db, async (transaction) => {
        const plan = await transaction.get(planDoc);
        const existing = await Promise.all(
          chunk.map((entry) =>
            transaction.get(moveRef(uid, getUndoMoveId(entry.paid.moveId))),
          ),
        );
        const open = chunk.filter((_, index) => !existing[index].exists());
        if (open.length > 0) {
          markLedgerWrite(
            transaction,
            uid,
            plan.data(),
            open.map((entry) => entry.paid.dueOn),
          );
        }
        open.forEach((entry) => {
          const id = getUndoMoveId(entry.paid.moveId);
          transaction.set(moveRef(uid, id), {
            id,
            kind: 'billPaid',
            date: entry.paid.dueOn,
            refId: entry.paid.billId,
            reversesMoveId: entry.paid.moveId,
            createdAt: Date.now(),
            sealed: entry.sealed,
          } satisfies MoveDoc);
        });
        if (chunkIndex === 0 && lines !== null && lines.lineIds.length > 0) {
          transaction.update(
            doc(db, 'apps', 'runway', 'plans', uid, 'days', lines.dayId),
            { doneLineIds: arrayRemove(...lines.lineIds) },
          );
        }
        return open.length;
      });
      return before + undone;
    },
    Promise.resolve(0),
  );
  return count;
}

/** Ticks or unticks lines on a confirmed day's checklist. Field-scoped, so another device's tick is never overwritten. */
export async function setLinesDone(
  uid: string,
  dayId: string,
  lineIds: readonly string[],
  isDone: boolean,
  current: readonly string[],
): Promise<void> {
  if (isDone && new Set([...current, ...lineIds]).size > MAX_DONE_LINE_IDS) {
    throw new Error('This checklist is full. Untick an item first.');
  }
  await updateDoc(doc(db, 'apps', 'runway', 'plans', uid, 'days', dayId), {
    doneLineIds: isDone ? arrayUnion(...lineIds) : arrayRemove(...lineIds),
  });
}

export interface StartHoldingInput {
  holding: StartHolding;
  /** The goal or bill; null for the money on hand. */
  refId: string | null;
  amountCents: Cents;
}

/** The id of a starting holding written at `createdAt`; a later run writes new ones and the latest counts. */
export const getStartMoveId = (refId: string | null, createdAt: number) =>
  `start_${refId ?? 'money'}_${createdAt}`;

/**
 * Records where things stand on the starting day: the date, one `start` move per holding and one
 * `start` change, in a single transaction that reads the plan, so a changed starting day marks every
 * closing stale. Rerunning it appends newer moves; nothing earlier is edited.
 */
export async function recordStart(
  uid: string,
  encryption: RunwayEncryption,
  startDate: DateOnly,
  holdings: readonly StartHoldingInput[],
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const [changeSealed, ...sealedMoves] = await Promise.all([
    sealJson(
      {
        summary: `Started from ${formatDateUTC(startDate)}.`,
      } satisfies ChangeSealed,
      encryption,
    ),
    ...holdings.map((entry) =>
      sealJson(
        {
          amountCents: entry.amountCents,
          holding: entry.holding,
        } satisfies StartSealed,
        encryption,
      ),
    ),
  ]);
  const ref = doc(db, 'apps', 'runway', 'plans', uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const plan = snapshot.data() as Partial<PlanDoc> | undefined;
    const before = plan?.startDate ?? null;
    const mark = getLedgerMark(
      plan,
      before === startDate ? [] : [before, startDate],
    );
    transaction.update(ref, { startDate, updatedAt: now, ...mark });
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'start',
        createdAt: now,
        effectiveFrom: startDate,
        itemIds: [],
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
    holdings.forEach((entry, index) => {
      const id = getStartMoveId(entry.refId, now);
      transaction.set(moveRef(uid, id), {
        id,
        kind: 'start',
        date: startDate,
        refId: entry.refId,
        reversesMoveId: null,
        createdAt: now,
        sealed: sealedMoves[index],
      } satisfies MoveDoc);
    });
  });
}

/**
 * Records what one goal or bill holds on the plan's starting day, for an item added after that day.
 * It writes a single `start` move and leaves the starting day, and every other holding, as they are.
 * Resolves false when the plan's starting day is no longer the one given, so nothing was written.
 */
export async function recordHolding(
  uid: string,
  encryption: RunwayEncryption,
  startDate: DateOnly,
  holding: StartHoldingInput,
): Promise<boolean> {
  const now = Date.now();
  const sealed = await sealJson(
    {
      amountCents: holding.amountCents,
      holding: holding.holding,
    } satisfies StartSealed,
    encryption,
  );
  const ref = doc(db, 'apps', 'runway', 'plans', uid);
  const isWritten = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const plan = snapshot.data() as Partial<PlanDoc> | undefined;
    if ((plan?.startDate ?? null) !== startDate) return false;
    markLedgerWrite(transaction, uid, plan, [startDate]);
    const id = getStartMoveId(holding.refId, now);
    transaction.set(moveRef(uid, id), {
      id,
      kind: 'start',
      date: startDate,
      refId: holding.refId,
      reversesMoveId: null,
      createdAt: now,
      sealed,
    } satisfies MoveDoc);
    return true;
  });
  return isWritten;
}
