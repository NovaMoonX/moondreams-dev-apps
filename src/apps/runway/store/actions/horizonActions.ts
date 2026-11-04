import {
  doc,
  runTransaction,
  writeBatch,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';

import { MAKE_BILL_WORDS } from '@apps/runway/constants';
import { getCostPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import { buildGroupDocs } from '@apps/runway/store/actions/itemActions';
import {
  assertPlanStarted,
  assertSourceLive,
  sealMoveLeftover,
  writeSealedMove,
  type MoveLeftoverInput,
} from '@apps/runway/store/actions/transferActions';
import {
  describeCostMadeBill,
  describeCostPaid,
  describeCostTakenBack,
} from '@apps/runway/utils/changeText';
import type {
  BillSealed,
  ChangeDoc,
  ChangeSealed,
  Cents,
  CostPaidMark,
  CostPaidSealed,
  DateOnly,
  GroupSealed,
  HorizonSealed,
  MoveDoc,
  PlanDoc,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  Sealed,
  TransferSealed,
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

/** The names a cost payment's History entries and toasts are written with. */
export interface CostPaidNames {
  item: string;
  cost: string;
}

export type WrittenCostPaid = {
  moveId: string;
  itemId: string;
} & CostPaidSealed;

/** How many earlier marks of one payment are looked past when a mark was undone, which the device may not have loaded. */
const MAX_MARK_PROBES = 12;

/** The History entry for one cost's payment marked paid or taken back, which carries what its Undo needs. */
export async function getCostPaidChange(
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: CostPaidNames,
  isUndo: boolean,
) {
  const undoText = describeCostTakenBack(
    names.cost,
    names.item,
    paid.dueOn,
    paid.amountCents,
    paid.fromFreeCents,
    paid.mark,
  );
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
 * The id the next mark of one payment takes, past marks that were undone; null when a live mark already
 * holds the payment, which is how a second mark of it is refused.
 */
export async function findOpenCostMark(
  transaction: Transaction,
  uid: string,
  itemId: string,
  costId: string,
  dueOn: DateOnly,
  marks: number,
  firstMark = marks,
): Promise<string | null> {
  if (marks >= firstMark + MAX_MARK_PROBES) {
    throw new Error(
      'This payment was marked and taken back too many times. Open the cost to change it.',
    );
  }
  const id = getCostPaidMoveId(itemId, costId, dueOn, marks);
  const existing = await transaction.get(planDoc(uid, 'moves', id));
  if (!existing.exists()) return id;
  const undone = await transaction.get(
    planDoc(uid, 'moves', getUndoMoveId(id)),
  );
  return undone.exists()
    ? findOpenCostMark(
        transaction,
        uid,
        itemId,
        costId,
        dueOn,
        marks + 1,
        firstMark,
      )
    : null;
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
    const id = await findOpenCostMark(
      transaction,
      uid,
      input.itemId,
      input.costId,
      input.dueOn,
      input.marks,
    );
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

/** The sealed payload of the move that takes a cost's paid mark back. */
export const sealCostUnmark = (
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
) =>
  sealJson(
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

/** Whether the move that takes a mark back is already written; read before any write of the transaction. */
export const isCostUnmarked = async (
  transaction: Transaction,
  uid: string,
  paid: WrittenCostPaid,
) =>
  (
    await transaction.get(planDoc(uid, 'moves', getUndoMoveId(paid.moveId)))
  ).exists();

/** Appends the move that reverses a mark, and its History entry, to a transaction that has read `isCostUnmarked` as false; the caller marks the ledger, once for all it writes. */
export function setCostUnmark(
  transaction: Transaction,
  uid: string,
  paid: WrittenCostPaid,
  sealed: Sealed,
  change: ChangeDoc,
) {
  const id = getUndoMoveId(paid.moveId);
  transaction.set(planDoc(uid, 'moves', id), {
    id,
    kind: 'costPaid',
    date: paid.dueOn,
    refId: paid.itemId,
    reversesMoveId: paid.moveId,
    createdAt: Date.now(),
    sealed,
  } satisfies MoveDoc);
  transaction.set(planDoc(uid, 'changes', change.id), change);
}

/** Undoes a cost's paid mark by appending a move that names it; the mark itself stays in the ledger. Resolves false when it was already taken back. */
export async function undoCostPaid(
  uid: string,
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: CostPaidNames,
): Promise<boolean> {
  const sealed = await sealCostUnmark(encryption, paid);
  const isWritten = await runTransaction(db, async (transaction) => {
    const [isDone, plan] = await Promise.all([
      isCostUnmarked(transaction, uid, paid),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ]);
    if (isDone) return false;
    const change = await getCostPaidChange(encryption, paid, names, true);
    markLedgerWrite(transaction, uid, plan.data(), [paid.dueOn]);
    setCostUnmark(transaction, uid, paid, sealed, change);
    return true;
  });
  return isWritten;
}

export interface MakeCostABillInput {
  /** `getMadeBillId` of the item and cost, so a retry or a second device resolves to the same bill. */
  billId: string;
  /** Made once by the caller, for the move of money. */
  moveId: string;
  itemId: string;
  itemName: string;
  costName: string;
  /** The item as it stands with the cost handed to the bill (`becameBillId` set). */
  horizon: HorizonSealed;
  bill: BillSealed;
  newGroup: GroupSealed | null;
  /** Money moved from the item to the bill, as this device reads what the item holds; zero moves none. */
  bringCents: Cents;
  /** Money moved from the item to Free to Spend instead, when the item has no other open cost; zero moves none. */
  freeCents: Cents;
  startDate: DateOnly;
}

/**
 * Makes a cost a bill in one transaction: the bill's header, first version and change (as `createBill`
 * writes them), the item's next version with the cost's `becameBillId`, and the move of money when any
 * goes. One change names both items. The bill's id comes from its cost, so a second device making the
 * same cost a bill finds the first one's header and throws the already-done error.
 */
export async function makeCostABill(
  uid: string,
  encryption: RunwayEncryption,
  input: MakeCostABillInput,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const movedCents = input.bringCents + input.freeCents;
  const groupDocs = input.newGroup
    ? await buildGroupDocs(
        encryption,
        { group: input.newGroup, startDate: input.startDate },
        now,
      )
    : null;
  const bill: BillSealed = groupDocs
    ? { ...input.bill, groupId: groupDocs.groupId }
    : input.bill;
  const [billSealed, horizonSealed, changeSealed, moveSealed] =
    await Promise.all([
      sealJson(bill, encryption),
      sealJson(input.horizon, encryption),
      sealJson(
        {
          summary: describeCostMadeBill(
            input.itemName,
            input.costName,
            bill,
            input.bringCents,
            input.freeCents,
          ),
        } satisfies ChangeSealed,
        encryption,
      ),
      movedCents > 0
        ? sealJson(
            {
              fromId: input.itemId,
              toId: input.bringCents > 0 ? input.billId : null,
              cents: movedCents,
              note: null,
              isOutside: false,
            } satisfies TransferSealed,
            encryption,
          )
        : Promise.resolve(null),
    ]);
  const version = (itemId: string, kind: 'bill' | 'horizon', sealed: Sealed) =>
    ({
      id: generateUuid(),
      itemId,
      kind,
      createdAt: now,
      effectiveFrom: input.startDate,
      effectiveUntil: null,
      changeId,
      sealed,
    }) satisfies PlanVersionDoc;
  const header = {
    id: input.billId,
    kind: 'bill',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
    heldReleasedOn: null,
  } satisfies PlanItemDoc;
  const change = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: input.startDate,
    itemIds: [input.itemId, input.billId],
    sealed: changeSealed,
  } satisfies ChangeDoc;

  return runTransaction(db, async (transaction) => {
    const [plan, item, existing] = await Promise.all([
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      transaction.get(planDoc(uid, 'items', input.itemId)),
      transaction.get(planDoc(uid, 'items', input.billId)),
    ]);
    if (existing.exists()) throw new Error(MAKE_BILL_WORDS.alreadyDone);
    if (movedCents > 0) assertPlanStarted(plan.data(), input.startDate);
    assertSourceLive(item.data() as Partial<PlanItemDoc> | undefined);
    if (groupDocs) {
      transaction.set(
        planDoc(uid, 'items', groupDocs.groupId),
        groupDocs.header,
      );
      transaction.set(
        planDoc(uid, 'versions', groupDocs.version.id),
        groupDocs.version,
      );
      transaction.set(
        planDoc(uid, 'changes', groupDocs.change.id),
        groupDocs.change,
      );
    }
    transaction.set(planDoc(uid, 'items', input.billId), header);
    const billVersion = version(input.billId, 'bill', billSealed);
    transaction.set(planDoc(uid, 'versions', billVersion.id), billVersion);
    const itemVersion = version(input.itemId, 'horizon', horizonSealed);
    transaction.set(planDoc(uid, 'versions', itemVersion.id), itemVersion);
    transaction.set(planDoc(uid, 'changes', changeId), change);
    if (moveSealed !== null) {
      markLedgerWrite(transaction, uid, plan.data(), [input.startDate]);
      transaction.set(planDoc(uid, 'moves', input.moveId), {
        id: input.moveId,
        kind: 'transfer',
        date: input.startDate,
        refId: input.itemId,
        reversesMoveId: null,
        createdAt: now,
        sealed: moveSealed,
      } satisfies MoveDoc);
    }
  });
}
