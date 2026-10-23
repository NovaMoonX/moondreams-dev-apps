import {
  arrayRemove,
  arrayUnion,
  doc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { MAX_DONE_LINE_IDS } from '@apps/runway/constants';
import { getPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { sealJson } from '@apps/runway/security';
import type {
  BillPaidSealed,
  Cents,
  DateOnly,
  MoveDoc,
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

/**
 * Records a bill as paid, ahead of its due date or on it. The move's id names the bill and the due
 * date, so a second tap finds it already there and writes nothing.
 */
export async function markBillPaid(
  uid: string,
  encryption: RunwayEncryption,
  input: MarkBillPaidInput,
): Promise<void> {
  const id = getPaidMoveId(input.billId, input.dueOn, input.marks);
  const payload: BillPaidSealed = {
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    fromFreeCents: Math.max(0, input.amountCents - input.fundedCents),
  };
  const sealed = await sealJson(payload, encryption);
  const ref = moveRef(uid, id);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return;
    transaction.set(ref, {
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
    const existing = await transaction.get(ref);
    if (existing.exists()) return;
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
