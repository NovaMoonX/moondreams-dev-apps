import {
  doc,
  getDoc,
  runTransaction,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  MAX_PURCHASE_LINES,
  PURCHASE_COST_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import {
  getCountedFrom,
  isInTrackingPeriods,
  sumLines,
} from '@apps/runway/engine/purchases';
import { createSealedReader, sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import {
  findOpenCostMark,
  getCostPaidChange,
  isCostUnmarked,
  sealCostUnmark,
  sealReopen,
  setCostUnmark,
  undoCostPaid,
  type CostPaidNames,
  type WrittenCostPaid,
} from '@apps/runway/store/actions/horizonActions';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getCostPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import {
  openMove,
  openPurchase,
} from '@apps/runway/store/listeners/openLedger';
import { removeReceiptImagesOf } from '@apps/runway/store/actions/receiptActions';
import { describePurchaseRemoval } from '@apps/runway/utils/purchaseText';
import type {
  Cents,
  CostPaidSealed,
  CostRef,
  DateOnly,
  HorizonSealed,
  OpenPurchase,
  ChangeDoc,
  ChangeSealed,
  PlanDoc,
  MoveDoc,
  PlanItemDoc,
  PurchaseDoc,
  PurchaseLine,
  PurchaseSealed,
  ExpenseDoc,
  ExpenseSealed,
  RunwayEncryption,
  Sealed,
} from '@apps/runway/types';

const purchaseRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'purchases', id);

/** The cost payment a new purchase marks paid, in the same write that adds it. */
export interface AddPurchaseCost {
  ref: CostRef;
  itemName: string;
  costName: string;
  /** The part beyond what the item held, which comes out of Free to Spend. */
  fromFreeCents: Cents;
  /** How many times this payment has been marked before, undone marks included. */
  marks: number;
}

export interface AddPurchaseInput {
  date: DateOnly;
  /** Negative for a refund. */
  amountCents: Cents;
  merchant: string | null;
  label: string | null;
  note: string | null;
  lines: PurchaseLine[];
  refundOfId: string | null;
  /** The card it was charged to; null when it was paid in cash. */
  paidByCardId: string | null;
  /** An https link to the order or receipt. */
  link: string | null;
  /** The items read from a receipt. */
  receiptText: string | null;
  /** The expense group it belongs to. */
  expenseId: string | null;
  /** The name of a group made with this purchase, written in the same transaction under `expenseId`. */
  newExpenseName: string | null;
  /** The cost payment it pays; used when adding, since an edit keeps the cost the purchase already pays. */
  cost: AddPurchaseCost | null;
}

/** What taking a purchase back needs to take its cost's mark back with it. */
export interface PurchaseCostMark {
  /** Null when the screen has not loaded the mark; the delete then looks for the live one itself. */
  paid: WrittenCostPaid | null;
  names: CostPaidNames;
  /** The event as it stands when it is finished: taking the mark back reopens it in the same transaction. */
  finished?: HorizonSealed | null;
}

const MAX_MARK_LOOKUPS = 12;

/** The live mark a purchase made, found by reading the marks of its payment in turn, for a delete whose screen has not loaded them. */
async function readLiveCostMark(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
): Promise<WrittenCostPaid | null> {
  const ref = previous.costRef ?? null;
  if (ref === null) return null;
  const read = createSealedReader(encryption);
  const lookup = async (index: number): Promise<WrittenCostPaid | null> => {
    if (index >= MAX_MARK_LOOKUPS) return null;
    const moveId = getCostPaidMoveId(ref.itemId, ref.costId, ref.dueOn, index);
    const [move, undo] = await Promise.all([
      getDoc(doc(db, 'apps', 'runway', 'plans', uid, 'moves', moveId)),
      getDoc(
        doc(db, 'apps', 'runway', 'plans', uid, 'moves', getUndoMoveId(moveId)),
      ),
    ]);
    if (!move.exists()) return null;
    if (undo.exists()) return lookup(index + 1);
    const opened = await openMove(
      { ...(move.data() as MoveDoc), id: move.id },
      read,
    );
    return opened.kind === 'costPaid' &&
      opened.payload.purchaseId === previous.id
      ? { moveId, itemId: ref.itemId, ...opened.payload }
      : lookup(index + 1);
  };
  return lookup(0);
}

export interface AddedPurchase {
  purchase: OpenPurchase;
  /** The mark written with it; null when it pays no cost. */
  paid: WrittenCostPaid | null;
}

const sealNewExpense = (
  input: AddPurchaseInput,
  encryption: RunwayEncryption,
) =>
  input.newExpenseName === null || input.expenseId === null
    ? null
    : sealJson(
        { name: input.newExpenseName, note: null } satisfies ExpenseSealed,
        encryption,
      );

const setNewExpense = (
  transaction: Transaction,
  uid: string,
  input: AddPurchaseInput,
  sealed: Sealed | null,
  now: number,
) => {
  if (sealed === null || input.expenseId === null) return;
  transaction.set(
    doc(db, 'apps', 'runway', 'plans', uid, 'expenses', input.expenseId),
    {
      id: input.expenseId,
      createdAt: now,
      updatedAt: now,
      sealed,
    } satisfies ExpenseDoc,
  );
};

/** Adds a purchase by hand; the plan and each envelope are read fresh in the same transaction, so a day outside tracking or an archived envelope is refused. A purchase that pays a cost marks that payment paid in the same transaction, and is refused when the payment is already marked. */
export async function addPurchase(
  uid: string,
  encryption: RunwayEncryption,
  input: AddPurchaseInput,
): Promise<AddedPurchase> {
  if (input.amountCents === 0) throw new Error('Enter an amount.');
  if (input.lines.length === 0 || input.lines.length > MAX_PURCHASE_LINES) {
    throw new Error('Pick where it comes from.');
  }
  if (sumLines(input.lines) !== input.amountCents) {
    throw new Error('The parts do not add up to the amount.');
  }

  const id = generateUuid();
  const { cost } = input;
  const costRef = cost?.ref ?? null;
  const expenseSealed = await sealNewExpense(input, encryption);
  const payload = {
    amountCents: input.amountCents,
    merchant: input.merchant,
    label: input.label,
    note: input.note,
    lines: input.lines,
    refundOfId: input.refundOfId,
    paidByCardId: input.paidByCardId,
    link: input.link,
    receiptText: input.receiptText,
    costRef,
  } satisfies PurchaseSealed;
  const sealed = await sealJson(payload, encryption);
  const markPayload: CostPaidSealed | null =
    cost === null
      ? null
      : {
          costId: cost.ref.costId,
          dueOn: cost.ref.dueOn,
          amountCents: input.amountCents,
          paidOn: input.date,
          fromFreeCents: cost.fromFreeCents,
          mark: 'purchase',
          purchaseId: id,
        };
  const markSealed =
    markPayload === null ? null : await sealJson(markPayload, encryption);

  const written = await runTransaction(db, async (transaction) => {
    const plan = await checkDayAndEnvelopes(
      transaction,
      uid,
      input.date,
      input.lines,
      new Set(),
      null,
    );

    const now = Date.now();
    markLedgerWrite(transaction, uid, plan, [
      input.date,
      ...(cost === null ? [] : [cost.ref.dueOn]),
    ]);
    setNewExpense(transaction, uid, input, expenseSealed, now);
    const paid = await setCostMark(
      transaction,
      uid,
      encryption,
      cost,
      markPayload,
      markSealed,
    );
    transaction.set(purchaseRef(uid, id), {
      id,
      date: input.date,
      source: 'manual',
      needsHome: false,
      expenseId: input.expenseId,
      createdAt: now,
      updatedAt: now,
      sealed,
    } satisfies PurchaseDoc);
    return { paid, now };
  });
  return {
    paid: written.paid,
    purchase: {
      ...payload,
      id,
      date: input.date,
      source: 'manual',
      needsHome: false,
      expenseId: input.expenseId,
      createdAt: written.now,
      updatedAt: written.now,
    },
  };
}

/** Writes the `costPaid` move for a purchase that pays a cost, with its History entry; the move's id refuses a payment that is already marked. */
async function setCostMark(
  transaction: Transaction,
  uid: string,
  encryption: RunwayEncryption,
  cost: AddPurchaseCost | null,
  payload: CostPaidSealed | null,
  sealed: Sealed | null,
): Promise<WrittenCostPaid | null> {
  if (cost === null || payload === null || sealed === null) return null;
  const moveId = await findOpenCostMark(
    transaction,
    uid,
    cost.ref.itemId,
    cost.ref.costId,
    cost.ref.dueOn,
    cost.marks,
  );
  if (moveId === null) {
    throw new Error(PURCHASE_COST_WORDS.alreadyPaid(cost.costName));
  }
  const paid: WrittenCostPaid = {
    moveId,
    itemId: cost.ref.itemId,
    ...payload,
  };
  const change = await getCostPaidChange(
    encryption,
    paid,
    { item: cost.itemName, cost: cost.costName },
    false,
  );
  transaction.set(doc(db, 'apps', 'runway', 'plans', uid, 'moves', moveId), {
    id: moveId,
    kind: 'costPaid',
    date: cost.ref.dueOn,
    refId: cost.ref.itemId,
    reversesMoveId: null,
    createdAt: Date.now(),
    sealed,
  } satisfies MoveDoc);
  transaction.set(
    doc(db, 'apps', 'runway', 'plans', uid, 'changes', change.id),
    change,
  );
  return paid;
}

/** Reads the plan and each envelope named, and refuses a day outside tracking or an envelope that is gone; `known` envelopes (already on the purchase) may be archived since. `keptDate` is the day an edited purchase already has: keeping it is allowed even when that day is in an earlier stretch, which is listed but never counted, while moving to such a day is refused like adding one. */
async function checkDayAndEnvelopes(
  transaction: Transaction,
  uid: string,
  date: DateOnly,
  lines: readonly PurchaseLine[],
  known: ReadonlySet<string>,
  keptDate: DateOnly | null,
): Promise<Partial<PlanDoc> | undefined> {
  const envelopeIds = [
    ...new Set(
      lines.flatMap((line) =>
        line.envelopeId === null || known.has(line.envelopeId)
          ? []
          : [line.envelopeId],
      ),
    ),
  ];
  const [plan, ...envelopes] = await Promise.all([
    transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ...envelopeIds.map((envelopeId) =>
      transaction.get(
        doc(db, 'apps', 'runway', 'plans', uid, 'items', envelopeId),
      ),
    ),
  ]);
  const planData = plan.data() as Partial<PlanDoc> | undefined;
  const periods = planData?.trackingPeriods ?? [];
  if (!isInTrackingPeriods(periods, date)) {
    throw new Error(
      `Tracking was not on for ${formatDateOrdinalUTC(date)}. Pick a day you were tracking.`,
    );
  }
  const countedFrom = getCountedFrom(periods);
  const isKept = keptDate === date && countedFrom !== null;
  if (!isKept && (countedFrom === null || date < countedFrom)) {
    throw new Error(
      countedFrom === null
        ? 'Tracking is off, probably from another device. Reopen Runway to see where it stands.'
        : `Tracking started again on ${formatDateOrdinalUTC(countedFrom)}, and an earlier day is not counted. Pick that day or a later one.`,
    );
  }
  const isGone = envelopes.some((snapshot) => {
    const item = snapshot.data() as PlanItemDoc | undefined;
    return (
      !item ||
      (item.kind !== 'envelope' && item.kind !== 'horizon') ||
      item.archivedAt !== null ||
      (item.kind === 'horizon' && item.endedAt !== null)
    );
  });
  if (isGone) {
    throw new Error(
      'An envelope you picked was archived, finished or removed on another device. Pick again.',
    );
  }
  return planData;
}

/** The purchase as stored must still be the one the person was looking at, or another device got there first. */
async function readUnchanged(
  transaction: Transaction,
  uid: string,
  previous: OpenPurchase,
) {
  const snapshot = await transaction.get(purchaseRef(uid, previous.id));
  if (!snapshot.exists()) {
    throw new Error('This purchase was already removed on another device.');
  }
  if ((snapshot.data() as PurchaseDoc).updatedAt !== previous.updatedAt) {
    throw new Error(SPEND_WORDS.changedElsewhere);
  }
}

const getChangeItemIds = (...lineSets: (readonly PurchaseLine[])[]) =>
  [
    ...new Set(
      lineSets.flatMap((lines) =>
        lines.flatMap((line) =>
          line.envelopeId === null ? [] : [line.envelopeId],
        ),
      ),
    ),
  ].slice(0, 20);

/** Saves a changed amount, envelope(s), day, place or note on a purchase. The purchase is re-read in the same transaction and refused if another device changed it first, so a second device never applies the difference twice. A change-log entry is written with it. */
export async function editPurchase(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  input: AddPurchaseInput,
  summary: string,
): Promise<void> {
  if (input.amountCents === 0) throw new Error('Enter an amount.');
  if (input.lines.length === 0 || input.lines.length > MAX_PURCHASE_LINES) {
    throw new Error('Pick where it comes from.');
  }
  if (sumLines(input.lines) !== input.amountCents) {
    throw new Error('The parts do not add up to the amount.');
  }
  const [sealed, changeSealed, expenseSealed] = await Promise.all([
    sealJson(
      {
        amountCents: input.amountCents,
        merchant: input.merchant,
        label: input.label,
        note: input.note,
        lines: input.lines,
        refundOfId: input.refundOfId,
        paidByCardId: input.paidByCardId,
        link: input.link,
        receiptText: input.receiptText,
        costRef: previous.costRef ?? null,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
    sealNewExpense(input, encryption),
  ]);
  const known = new Set(
    previous.lines.flatMap((line) =>
      line.envelopeId === null ? [] : [line.envelopeId],
    ),
  );
  const changeId = generateUuid();

  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, previous);
    const plan = await checkDayAndEnvelopes(
      transaction,
      uid,
      input.date,
      input.lines,
      known,
      previous.date,
    );
    const now = Math.max(Date.now(), previous.updatedAt + 1);
    markLedgerWrite(transaction, uid, plan, [previous.date, input.date]);
    setNewExpense(transaction, uid, input, expenseSealed, now);
    transaction.update(purchaseRef(uid, previous.id), {
      date: input.date,
      expenseId: input.expenseId,
      updatedAt: now,
      sealed,
    });
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'purchaseChange',
        createdAt: now,
        effectiveFrom: null,
        itemIds: getChangeItemIds(previous.lines, input.lines),
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
}

/** Removes a purchase (its lines go with it, so the envelopes and Free to Spend recover). Refused when another device changed or removed it first; a change-log entry is written with it. A purchase that pays a cost takes that cost's mark back in the same transaction (`costMark`), unless it was already taken back. */
export async function deletePurchase(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  summary: string,
  costMark: PurchaseCostMark | null = null,
): Promise<void> {
  const changeSealed = await sealJson(
    { summary, note: null } satisfies ChangeSealed,
    encryption,
  );
  const paid =
    costMark === null
      ? null
      : (costMark.paid ?? (await readLiveCostMark(uid, encryption, previous)));
  const names = costMark?.names ?? null;
  const [unmarkSealed, unmarkChange, reopen] =
    paid === null || names === null
      ? [null, null, null]
      : await Promise.all([
          sealCostUnmark(encryption, paid),
          getCostPaidChange(encryption, paid, names, true),
          costMark?.finished
            ? sealReopen(
                encryption,
                costMark.finished,
                paid.itemId,
                names.cost,
                todayAsUtcDate(),
                paid.moveId,
              )
            : Promise.resolve(null),
        ]);
  const changeId = generateUuid();
  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, previous);
    const plan = await transaction.get(doc(db, 'apps', 'runway', 'plans', uid));
    const isUnmarkNeeded =
      paid !== null && !(await isCostUnmarked(transaction, uid, paid));
    markLedgerWrite(transaction, uid, plan.data(), [
      previous.date,
      ...(isUnmarkNeeded && paid ? [paid.dueOn] : []),
    ]);
    if (isUnmarkNeeded && paid && unmarkSealed && unmarkChange) {
      setCostUnmark(transaction, uid, paid, unmarkSealed, unmarkChange, reopen);
    }
    transaction.delete(purchaseRef(uid, previous.id));
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'purchaseChange',
        createdAt: Date.now(),
        effectiveFrom: null,
        itemIds: getChangeItemIds(previous.lines),
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
}

/** Takes a cost's purchase mark back by removing the purchase that made it, which writes the undo with it. The purchase is read from its own document, since the loaded window may not hold it; one already gone leaves only the mark to take back. Resolves false when the mark was already taken back. */
export async function removePurchaseOfCost(
  uid: string,
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: CostPaidNames,
  finished: HorizonSealed | null = null,
): Promise<boolean> {
  const snapshot =
    paid.purchaseId === null
      ? null
      : await getDoc(purchaseRef(uid, paid.purchaseId));
  if (snapshot === null || !snapshot.exists()) {
    return undoCostPaid(uid, encryption, paid, names, finished);
  }
  const previous = await openPurchase(
    { ...(snapshot.data() as PurchaseDoc), id: snapshot.id },
    createSealedReader(encryption),
  );
  await deletePurchase(
    uid,
    encryption,
    previous,
    describePurchaseRemoval(previous, () => names.item),
    { paid, names, finished },
  );
  await removeReceiptImagesOf(uid, previous.id).catch((cleanupError) => {
    console.error('A removed purchase left receipts behind', cleanupError);
  });
  return true;
}
