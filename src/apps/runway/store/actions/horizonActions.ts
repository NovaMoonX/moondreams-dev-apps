import { doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';

import { getCostPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import {
  assertPlanStarted,
  assertSourceLive,
  sealMoveLeftover,
  writeSealedMove,
  type MoveLeftoverInput,
} from '@apps/runway/store/actions/transferActions';
import {
  describeCostPaid,
  describeCostTakenBack,
} from '@apps/runway/utils/changeText';
import type {
  ChangeDoc,
  ChangeSealed,
  Cents,
  CostPaidMark,
  CostPaidSealed,
  DateOnly,
  HorizonSealed,
  MoveDoc,
  PlanDoc,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
} from '@apps/runway/types';

const planDoc = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

export interface AddHorizonInput {
  /** Made once by the caller so a retry of the same add resolves to the same item. */
  horizonId: string;
  horizon: HorizonSealed;
  /** The first day this item is in the plan. */
  startDate: number;
  /** Money put toward the item as it is added; its target is the new item. Null puts none. */
  toward: Omit<MoveLeftoverInput, 'toId' | 'note' | 'isOutside'> | null;
}

/**
 * Adds a Horizon item as a header, a first version and one change entry in a single write: a batch,
 * or a transaction that also carries the move of money put toward it. Items and versions are created
 * and never updated; nothing is written to `days`.
 */
export async function addHorizon(
  uid: string,
  encryption: RunwayEncryption,
  { horizonId, horizon, startDate, toward }: AddHorizonInput,
): Promise<{ horizonId: string }> {
  const now = Date.now();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = { summary: `Added ${horizon.name}.` };

  const [horizonSealed, changeSealed] = await Promise.all([
    sealJson(horizon, encryption),
    sealJson(changePayload, encryption),
  ]);

  const header: PlanItemDoc = {
    id: horizonId,
    kind: 'horizon',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
    heldReleasedOn: null,
  };
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: horizonId,
    kind: 'horizon',
    createdAt: now,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId,
    sealed: horizonSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [horizonId],
    sealed: changeSealed,
  };

  if (toward === null) {
    const batch = writeBatch(db);
    batch.set(planDoc(uid, 'items', horizonId), header);
    batch.set(planDoc(uid, 'versions', version.id), version);
    batch.set(planDoc(uid, 'changes', changeId), change);
    await batch.commit();
    return { horizonId };
  }

  const move = await sealMoveLeftover(encryption, {
    ...toward,
    toId: horizonId,
    note: null,
    isOutside: false,
  });
  await runTransaction(db, async (transaction) => {
    const [plan, from, existing] = await Promise.all([
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      toward.fromId === null
        ? Promise.resolve(null)
        : transaction.get(planDoc(uid, 'items', toward.fromId)),
      transaction.get(planDoc(uid, 'moves', toward.moveId)),
    ]);
    if (existing.exists()) return;
    const data = plan.data() as Partial<PlanDoc> | undefined;
    assertPlanStarted(data, move.date);
    if (from !== null) {
      assertSourceLive(from.data() as Partial<PlanItemDoc> | undefined);
    }
    transaction.set(planDoc(uid, 'items', horizonId), header);
    transaction.set(planDoc(uid, 'versions', version.id), version);
    transaction.set(planDoc(uid, 'changes', changeId), change);
    writeSealedMove(
      transaction,
      uid,
      toward.moveId,
      data,
      move,
      toward.fromId ?? horizonId,
    );
  });

  return { horizonId };
}

export interface MarkCostPaidInput {
  itemId: string;
  itemName: string;
  costId: string;
  costName: string;
  /** The due date of the payment being paid. */
  dueOn: DateOnly;
  amountCents: Cents;
  /** The part beyond what the item held, out of Free to Spend; zero for a mark outside the plan. */
  fromFreeCents: Cents;
  paidOn: DateOnly;
  mark: Extract<CostPaidMark, 'item' | 'outside'>;
  /** How many times this payment has been marked before, undone marks included. */
  marks: number;
}

export type WrittenCostPaid = {
  moveId: string;
  itemId: string;
} & CostPaidSealed;

/** How many earlier marks of one payment are looked past when a mark was undone, which the device may not have loaded. */
const MAX_MARK_PROBES = 12;

/** The History entry for one cost's payment marked paid or taken back, which carries what its Undo needs. */
async function getCostPaidChange(
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: { item: string; cost: string },
  isUndo: boolean,
) {
  const undoText = describeCostTakenBack(names.cost, names.item, paid.dueOn);
  const id = generateUuid();
  return {
    id,
    kind: 'paymentChange',
    createdAt: Date.now(),
    effectiveFrom: null,
    itemIds: [paid.itemId],
    sealed: await sealJson(
      {
        summary: isUndo
          ? `${undoText}.`
          : describeCostPaid(
              names.cost,
              names.item,
              paid.dueOn,
              paid.amountCents,
              paid.mark,
            ),
        note: null,
        move: {
          moveId: paid.moveId,
          date: paid.dueOn,
          fromId: null,
          toId: null,
          cents: paid.amountCents,
          note: null,
          isOutside: false,
          undoText,
          isUndo,
          bill: null,
          cost: {
            itemId: paid.itemId,
            itemName: names.item,
            costId: paid.costId,
            name: names.cost,
            dueOn: paid.dueOn,
            paidOn: paid.paidOn,
            amountCents: paid.amountCents,
            fromFreeCents: paid.fromFreeCents,
            mark: paid.mark,
            purchaseId: paid.purchaseId,
          },
        },
      } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
}

/**
 * Records a cost's payment as paid, from the item's money or outside the plan. The move's id names the
 * item, the cost, the due date and which mark it is, so a second tap on a paid payment writes nothing and
 * a payment from a month the device has not loaded can still be marked after an undo.
 */
export async function markCostPaid(
  uid: string,
  encryption: RunwayEncryption,
  input: MarkCostPaidInput,
): Promise<WrittenCostPaid | null> {
  const payload: CostPaidSealed = {
    costId: input.costId,
    dueOn: input.dueOn,
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    fromFreeCents: input.mark === 'outside' ? 0 : input.fromFreeCents,
    mark: input.mark,
    purchaseId: null,
  };
  const sealed = await sealJson(payload, encryption);
  const written = await runTransaction(db, async (transaction) => {
    const plan = await transaction.get(doc(db, 'apps', 'runway', 'plans', uid));
    const findOpenMark = async (marks: number): Promise<string | null> => {
      if (marks >= input.marks + MAX_MARK_PROBES) {
        throw new Error(
          'This payment was marked and taken back too many times. Open the cost to change it.',
        );
      }
      const id = getCostPaidMoveId(
        input.itemId,
        input.costId,
        input.dueOn,
        marks,
      );
      const existing = await transaction.get(planDoc(uid, 'moves', id));
      if (!existing.exists()) return id;
      const undone = await transaction.get(
        planDoc(uid, 'moves', getUndoMoveId(id)),
      );
      return undone.exists() ? findOpenMark(marks + 1) : null;
    };
    const id = await findOpenMark(input.marks);
    if (id === null) return null;
    const mark: WrittenCostPaid = {
      moveId: id,
      itemId: input.itemId,
      ...payload,
    };
    const change = await getCostPaidChange(
      encryption,
      mark,
      { item: input.itemName, cost: input.costName },
      false,
    );
    markLedgerWrite(transaction, uid, plan.data(), [input.dueOn]);
    transaction.set(planDoc(uid, 'moves', id), {
      id,
      kind: 'costPaid',
      date: input.dueOn,
      refId: input.itemId,
      reversesMoveId: null,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    transaction.set(planDoc(uid, 'changes', change.id), change);
    return mark;
  });
  return written;
}

/** Undoes a cost's paid mark by appending a move that names it; the mark itself stays in the ledger. Resolves false when it was already taken back. */
export async function undoCostPaid(
  uid: string,
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: { item: string; cost: string },
): Promise<boolean> {
  const id = getUndoMoveId(paid.moveId);
  const sealed = await sealJson(
    {
      costId: paid.costId,
      dueOn: paid.dueOn,
      amountCents: paid.amountCents,
      paidOn: paid.paidOn,
      fromFreeCents: paid.fromFreeCents,
      mark: paid.mark,
      purchaseId: paid.purchaseId,
    } satisfies CostPaidSealed,
    encryption,
  );
  const ref = planDoc(uid, 'moves', id);
  const isWritten = await runTransaction(db, async (transaction) => {
    const [existing, plan] = await Promise.all([
      transaction.get(ref),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ]);
    if (existing.exists()) return false;
    const change = await getCostPaidChange(encryption, paid, names, true);
    markLedgerWrite(transaction, uid, plan.data(), [paid.dueOn]);
    transaction.set(ref, {
      id,
      kind: 'costPaid',
      date: paid.dueOn,
      refId: paid.itemId,
      reversesMoveId: paid.moveId,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    transaction.set(planDoc(uid, 'changes', change.id), change);
    return true;
  });
  return isWritten;
}
