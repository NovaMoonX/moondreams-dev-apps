import {
  arrayRemove,
  arrayUnion,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { MAX_DONE_LINE_IDS } from '@apps/runway/constants';
import { getPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { sealJson } from '@apps/runway/security';
import type {
  BillPaidSealed,
  ChangeDoc,
  ChangeSealed,
  StartHolding,
  StartSealed,
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
 * `start` change, in a single batch. Rerunning it appends newer moves; nothing earlier is edited.
 */
export async function recordStart(
  uid: string,
  encryption: RunwayEncryption,
  startDate: DateOnly,
  holdings: readonly StartHoldingInput[],
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const batch = writeBatch(db);
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
  batch.update(doc(db, 'apps', 'runway', 'plans', uid), {
    startDate,
    updatedAt: now,
  });
  batch.set(doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId), {
    id: changeId,
    kind: 'start',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [],
    sealed: changeSealed,
  } satisfies ChangeDoc);
  holdings.forEach((entry, index) => {
    const id = getStartMoveId(entry.refId, now);
    batch.set(moveRef(uid, id), {
      id,
      kind: 'start',
      date: startDate,
      refId: entry.refId,
      reversesMoveId: null,
      createdAt: now,
      sealed: sealedMoves[index],
    } satisfies MoveDoc);
  });
  await batch.commit();
}
