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
  /** What was set aside for it already; the rest comes out of Free to spend. */
  fundedCents: Cents;
  paidOn: DateOnly;
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

/** Ticks or unticks lines on a confirmed day's checklist. Field-scoped, so another device's tick is never overwritten. */
export async function setLinesDone(
  uid: string,
  dayId: string,
  lineIds: readonly string[],
  isDone: boolean,
  current: readonly string[],
): Promise<void> {
  if (isDone && new Set([...current, ...lineIds]).size > MAX_DONE_LINE_IDS) {
    throw new Error('This checklist is full. Untick a line first.');
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
