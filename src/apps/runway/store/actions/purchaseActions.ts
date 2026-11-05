import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  DEPOSIT_WORDS,
  HORIZON_END_WORDS,
  MAX_PURCHASE_LINES,
  PAIR_WORDS,
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
import { setLinesDone } from '@apps/runway/store/actions/moveActions';
import { getMoveLineId } from '@apps/runway/store/selectors/moveSelectors';
import {
  findOpenCostMark,
  getCostPaidChange,
  isCostUnmarked,
  isReopenTaken,
  sealCostUnmark,
  sealReopen,
  setCostUnmark,
  undoCostPaid,
  type CostPaidNames,
  type FinishedHorizon,
  type WrittenCostPaid,
} from '@apps/runway/store/actions/horizonActions';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getCostPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import {
  openMove,
  openPurchase,
} from '@apps/runway/store/listeners/openLedger';
import {
  getCardPaymentMoveId,
  getUndoCardPaymentMoveId,
} from '@apps/runway/store/actions/cardActions';
import { removeReceiptImagesOf } from '@apps/runway/store/actions/receiptActions';
import { describePurchaseRemoval } from '@apps/runway/utils/purchaseText';
import type {
  Cents,
  CardPaymentCovers,
  CardPaymentSealed,
  CostPaidSealed,
  CostRef,
  DateOnly,
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
  IncomeDayDoc,
  PurchaseAssignedBy,
  PurchasePairKind,
  ReceiptImageDoc,
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
  finished?: FinishedHorizon | null;
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
    notSameAs: null,
    incomeDayId: null,
    assignedBy: null,
    pairedWithId: null,
    pairKind: null,
    cardPaymentMoveId: null,
    tickedDayKey: null,
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
      status: null,
      needsHome: false,
      accountId: null,
      dedupeKey: null,
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
      status: null,
      accountId: null,
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

/** Reads the plan and each envelope named, and refuses a day outside tracking or an envelope that is gone; `known` envelopes (already on the purchase) may be archived since. `isDateStored` skips both day checks for a purchase from the bank, whose date is the bank's and can be before tracking began. `keptDate` is the day an edited purchase already has: keeping it is allowed even when that day is in an earlier stretch, which is listed but never counted, while moving to such a day is refused like adding one. */
async function checkDayAndEnvelopes(
  transaction: Transaction,
  uid: string,
  date: DateOnly,
  lines: readonly PurchaseLine[],
  known: ReadonlySet<string>,
  keptDate: DateOnly | null,
  isDayExempt = false,
  isDateStored = false,
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
  if (isDayExempt) return planData;
  if (!isDateStored && !isInTrackingPeriods(periods, date)) {
    throw new Error(
      `Tracking was not on for ${formatDateOrdinalUTC(date)}. Pick a day you were tracking.`,
    );
  }
  const countedFrom = getCountedFrom(periods);
  const isKept = keptDate === date && countedFrom !== null;
  if (
    !isDateStored &&
    !isKept &&
    (countedFrom === null || date < countedFrom)
  ) {
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
        notSameAs: previous.notSameAs,
        incomeDayId: previous.incomeDayId,
        assignedBy: previous.assignedBy,
        pairedWithId: null,
        pairKind: null,
        cardPaymentMoveId: null,
        tickedDayKey: null,
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

  const now = Math.max(Date.now(), previous.updatedAt + 1);

  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, previous);
    const plan = await checkDayAndEnvelopes(
      transaction,
      uid,
      input.date,
      input.lines,
      known,
      previous.date,
      false,
      previous.source === 'link' && input.date === previous.date,
    );
    const leavePair = await readPairExit(
      transaction,
      uid,
      encryption,
      previous,
      now,
    );
    markLedgerWrite(transaction, uid, plan, [previous.date, input.date]);
    leavePair();
    setNewExpense(transaction, uid, input, expenseSealed, now);
    transaction.update(purchaseRef(uid, previous.id), {
      date: input.date,
      expenseId: input.expenseId,
      needsHome: false,
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
  await untickPairMove(uid, previous);
}

/** Gives a purchase waiting in Needs a home its envelopes, or none (a deposit left out of spending), in one transaction that refuses when another device changed it first. A change-log entry is written with it; resolves with the purchase's new `updatedAt`. */
export async function assignPurchase(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  lines: PurchaseLine[],
  summary: string,
  needsHome = false,
): Promise<number> {
  if (lines.length > MAX_PURCHASE_LINES)
    throw new Error('Pick where it comes from.');
  if (lines.length > 0 && sumLines(lines) !== previous.amountCents) {
    throw new Error('The parts do not add up to the amount.');
  }
  const [sealed, changeSealed] = await Promise.all([
    sealJson(
      {
        amountCents: previous.amountCents,
        merchant: previous.merchant,
        label: previous.label,
        note: previous.note,
        lines,
        refundOfId: previous.refundOfId,
        paidByCardId: previous.paidByCardId ?? null,
        link: previous.link,
        receiptText: previous.receiptText,
        costRef: previous.costRef ?? null,
        notSameAs: previous.notSameAs,
        incomeDayId: null,
        assignedBy: previous.assignedBy,
        pairedWithId: null,
        pairKind: null,
        cardPaymentMoveId: null,
        tickedDayKey: null,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
  ]);
  const changeId = generateUuid();
  const now = Math.max(Date.now(), previous.updatedAt + 1);

  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, previous);
    const plan = await checkDayAndEnvelopes(
      transaction,
      uid,
      previous.date,
      lines,
      new Set(),
      previous.date,
      lines.length === 0,
      previous.source === 'link',
    );
    const leavePair = await readPairExit(
      transaction,
      uid,
      encryption,
      previous,
      now,
    );
    markLedgerWrite(transaction, uid, plan, [previous.date]);
    leavePair();
    transaction.update(purchaseRef(uid, previous.id), {
      needsHome,
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
        itemIds: getChangeItemIds(lines),
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
  await untickPairMove(uid, previous);
  return now;
}

/** Puts a purchase sent or left out from Needs a home back to waiting as the bank brought it in: a charge on its one Free to Spend line, money in on none. */
export const returnPurchaseToWaiting = (
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  summary: string,
) =>
  assignPurchase(
    uid,
    encryption,
    previous,
    previous.amountCents > 0
      ? [{ envelopeId: null, cents: previous.amountCents, via: 'free' }]
      : [],
    summary,
    true,
  );

/** Moves a deposit between Needs a home and an income day (or from a day no screen shows to another) in one transaction that refuses when another device changed it first or the day was marked as not arrived. A change-log entry is written with it; resolves with the deposit's new `updatedAt`. A confirmed day's split is never read or written. */
async function setDepositDay(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  next: Pick<OpenPurchase, 'incomeDayId' | 'assignedBy' | 'needsHome'>,
  summary: string,
): Promise<number> {
  const [sealed, changeSealed] = await Promise.all([
    sealJson(
      {
        ...toSealedPayload(previous),
        lines: [],
        incomeDayId: next.incomeDayId,
        assignedBy: next.assignedBy,
        pairedWithId: null,
        pairKind: null,
        cardPaymentMoveId: null,
        tickedDayKey: null,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
  ]);
  const changeId = generateUuid();
  const now = Math.max(Date.now(), previous.updatedAt + 1);

  await runTransaction(db, async (transaction) => {
    const [stored, day, plan] = await Promise.all([
      transaction.get(purchaseRef(uid, previous.id)),
      next.incomeDayId === null
        ? null
        : transaction.get(
            doc(db, 'apps', 'runway', 'plans', uid, 'days', next.incomeDayId),
          ),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ]);
    if (!stored.exists()) throw new Error(DEPOSIT_WORDS.gone);
    const storedDoc = stored.data() as PurchaseDoc;
    if (storedDoc.updatedAt !== previous.updatedAt) {
      throw new Error(SPEND_WORDS.changedElsewhere);
    }
    if (previous.incomeDayId === next.incomeDayId) {
      throw new Error(
        next.needsHome ? DEPOSIT_WORDS.notLinked : DEPOSIT_WORDS.notWaiting,
      );
    }
    if (
      (day?.data() as Partial<IncomeDayDoc> | undefined)?.status ===
      'notArrived'
    ) {
      throw new Error(DEPOSIT_WORDS.dayNotArrived);
    }
    const leavePair = await readPairExit(
      transaction,
      uid,
      encryption,
      previous,
      now,
    );
    markLedgerWrite(transaction, uid, plan.data(), [previous.date]);
    leavePair();
    transaction.update(purchaseRef(uid, previous.id), {
      needsHome: next.needsHome,
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
        itemIds: [],
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
  await untickPairMove(uid, previous);
  return now;
}

/** Links a deposit waiting in Needs a home to the income day it is, taking it out of Needs a home with no envelopes. */
export const linkDepositToDay = (
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  dayId: string,
  assignedBy: PurchaseAssignedBy,
  summary: string,
) =>
  setDepositDay(
    uid,
    encryption,
    previous,
    { incomeDayId: dayId, assignedBy, needsHome: false },
    summary,
  );

/** Sends a linked deposit back to Needs a home. It is marked as the person's, so no pass links it again. */
export const unlinkDeposit = (
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  summary: string,
) =>
  setDepositDay(
    uid,
    encryption,
    previous,
    { incomeDayId: null, assignedBy: 'person', needsHome: true },
    summary,
  );

const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const moveRef = (uid: string, moveId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'moves', moveId);

/** How many payments to one card on one day are looked past when a pairing needs a free move id. */
const MAX_PAIR_MOVE_PROBES = 12;

/** Reads, inside the transaction and before any write, the card payment a purchase leaving its pair carries, and returns the write that takes it back: the move that reverses it, unless that already exists. Throws when the payment it names is gone. Call it before the transaction's first write, then call what it returns. */
async function readPairExit(
  transaction: Transaction,
  uid: string,
  encryption: RunwayEncryption,
  purchase: Pick<OpenPurchase, 'cardPaymentMoveId'>,
  now: number,
): Promise<() => void> {
  const paymentId = purchase.cardPaymentMoveId;
  if (paymentId === null) return () => undefined;
  const reversalId = getUndoCardPaymentMoveId(paymentId);
  const [payment, reversal] = await Promise.all([
    transaction.get(moveRef(uid, paymentId)),
    transaction.get(moveRef(uid, reversalId)),
  ]);
  if (!payment.exists()) throw new Error(PAIR_WORDS.paymentMissing);
  if (reversal.exists()) return () => undefined;
  const taken = await openMove(
    { ...(payment.data() as MoveDoc), id: payment.id },
    createSealedReader(encryption),
  );
  if (taken.kind !== 'cardPayment') return () => undefined;
  const sealed = await sealJson(
    {
      amountCents: taken.payload.amountCents,
      covers: taken.payload.covers ?? 'full',
    } satisfies CardPaymentSealed,
    encryption,
  );
  return () =>
    transaction.set(moveRef(uid, reversalId), {
      id: reversalId,
      kind: 'cardPayment',
      date: taken.date,
      refId: taken.refId,
      reversesMoveId: taken.id,
      createdAt: now,
      sealed,
    } satisfies MoveDoc);
}

/** Unticks the income day's "Move to" item the pairing ticked, only while the purchase still records it; a tick that does not clear never fails the change that left the pair. */
export async function untickPairMove(
  uid: string,
  purchase: Pick<OpenPurchase, 'tickedDayKey' | 'accountId'>,
) {
  if (purchase.tickedDayKey === null || purchase.accountId === null) return;
  try {
    await setLinesDone(
      uid,
      purchase.tickedDayKey,
      [getMoveLineId(purchase.accountId)],
      false,
      [],
    );
  } catch (error) {
    console.error('A move to an account was not unticked', error);
  }
}

/** Records on the money-in side of a transfer which income day's "Move to" tick the pairing made, so every way out of the pair can untick it. Resolves with the purchase as it now stands; refuses when it changed first. */
export async function recordPairTick(
  uid: string,
  encryption: RunwayEncryption,
  into: OpenPurchase,
  dayKey: string,
): Promise<OpenPurchase> {
  const sealed = await sealJson(
    { ...toSealedPayload(into), tickedDayKey: dayKey } satisfies PurchaseSealed,
    encryption,
  );
  const now = Math.max(Date.now(), into.updatedAt + 1);
  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, into);
    transaction.update(purchaseRef(uid, into.id), { updatedAt: now, sealed });
  });
  return { ...into, tickedDayKey: dayKey, updatedAt: now };
}

/** Both purchases must still be the ones the person saw, or another device got there first. */
async function readPairUnchanged(
  transaction: Transaction,
  uid: string,
  out: OpenPurchase,
  into: OpenPurchase,
) {
  const [storedOut, storedIn] = await Promise.all([
    transaction.get(purchaseRef(uid, out.id)),
    transaction.get(purchaseRef(uid, into.id)),
  ]);
  if (!storedOut.exists() || !storedIn.exists()) {
    throw new Error(PAIR_WORDS.gone);
  }
  if (
    (storedOut.data() as PurchaseDoc).updatedAt !== out.updatedAt ||
    (storedIn.data() as PurchaseDoc).updatedAt !== into.updatedAt
  ) {
    throw new Error(SPEND_WORDS.changedElsewhere);
  }
}

export interface PairedPurchases {
  /** The money out, as it stands after pairing. */
  out: OpenPurchase;
  /** The money in, as it stands after pairing. */
  into: OpenPurchase;
  /** The `cardPayment` move written for a card payment; null for a transfer. */
  moveId: string | null;
}

/** Pairs the money out of one linked account with the same money in to another account or a card as a move between the person's own accounts, in one transaction that refuses when either changed first. Both sides leave Needs a home with no envelopes; a card payment also writes the card's `cardPayment` move, dated on the card's side, so what the card owes follows the bank. A change-log entry is written with it. */
export async function pairAccountPurchases(
  uid: string,
  encryption: RunwayEncryption,
  out: OpenPurchase,
  into: OpenPurchase,
  kind: PurchasePairKind,
  assignedBy: PurchaseAssignedBy,
  summary: string,
  covers: CardPaymentCovers,
): Promise<PairedPurchases> {
  if (
    !out.needsHome ||
    !into.needsHome ||
    out.pairedWithId !== null ||
    into.pairedWithId !== null
  ) {
    throw new Error(PAIR_WORDS.notWaiting);
  }
  const cardId = kind === 'cardPayment' ? (into.paidByCardId ?? null) : null;
  if (kind === 'cardPayment' && cardId === null) {
    throw new Error(PAIR_WORDS.notWaiting);
  }
  const changeSealed = await sealJson(
    { summary, note: null } satisfies ChangeSealed,
    encryption,
  );
  const changeId = generateUuid();
  const now = Math.max(Date.now(), out.updatedAt + 1, into.updatedAt + 1);

  const moveId = await runTransaction(db, async (transaction) => {
    const [plan] = await Promise.all([
      transaction.get(planRef(uid)),
      readPairUnchanged(transaction, uid, out, into),
    ]);
    const findFree = async (count: number): Promise<string> => {
      if (count > MAX_PAIR_MOVE_PROBES || cardId === null) {
        throw new Error(PAIR_WORDS.tooManyPayments);
      }
      const candidate = getCardPaymentMoveId(cardId, into.date, count);
      const existing = await transaction.get(moveRef(uid, candidate));
      return existing.exists() ? findFree(count + 1) : candidate;
    };
    const paymentId = cardId === null ? null : await findFree(1);
    const [leaveOut, leaveInto] = await Promise.all([
      readPairExit(transaction, uid, encryption, out, now),
      readPairExit(transaction, uid, encryption, into, now),
    ]);
    const [outSealed, inSealed, paymentSealed] = await Promise.all([
      sealJson(
        {
          ...toSealedPayload(out),
          lines: [],
          assignedBy,
          pairedWithId: into.id,
          pairKind: kind,
          cardPaymentMoveId: null,
          tickedDayKey: null,
        } satisfies PurchaseSealed,
        encryption,
      ),
      sealJson(
        {
          ...toSealedPayload(into),
          lines: [],
          assignedBy,
          pairedWithId: out.id,
          pairKind: kind,
          cardPaymentMoveId: paymentId,
          tickedDayKey: null,
        } satisfies PurchaseSealed,
        encryption,
      ),
      paymentId === null
        ? null
        : sealJson(
            {
              amountCents: out.amountCents,
              covers,
            } satisfies CardPaymentSealed,
            encryption,
          ),
    ]);
    markLedgerWrite(transaction, uid, plan.data(), [out.date, into.date]);
    leaveOut();
    leaveInto();
    transaction.update(purchaseRef(uid, out.id), {
      needsHome: false,
      updatedAt: now,
      sealed: outSealed,
    });
    transaction.update(purchaseRef(uid, into.id), {
      needsHome: false,
      updatedAt: now,
      sealed: inSealed,
    });
    if (paymentId !== null && paymentSealed !== null && cardId !== null) {
      transaction.set(moveRef(uid, paymentId), {
        id: paymentId,
        kind: 'cardPayment',
        date: into.date,
        refId: cardId,
        reversesMoveId: null,
        createdAt: now,
        sealed: paymentSealed,
      } satisfies MoveDoc);
    }
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'purchaseChange',
        createdAt: now,
        effectiveFrom: null,
        itemIds: [],
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
    return paymentId;
  });
  await untickPairMove(uid, into);
  return {
    out: {
      ...out,
      lines: [],
      needsHome: false,
      assignedBy,
      pairedWithId: into.id,
      pairKind: kind,
      cardPaymentMoveId: null,
      tickedDayKey: null,
      updatedAt: now,
    },
    into: {
      ...into,
      lines: [],
      needsHome: false,
      assignedBy,
      pairedWithId: out.id,
      pairKind: kind,
      cardPaymentMoveId: moveId,
      tickedDayKey: null,
      updatedAt: now,
    },
    moveId,
  };
}

/** What the sync gives a purchase waiting in Needs a home: a charge on its one Free to Spend line, money in on none. */
const getWaitingLines = (amountCents: Cents): PurchaseLine[] =>
  amountCents > 0
    ? [{ envelopeId: null, cents: amountCents, via: 'free' }]
    : [];

/** Sends a pair back to Needs a home, each as the bank brought it in, in one transaction that refuses when either changed first or they are not paired with each other. Both are marked as the person's, so no pass pairs them again. A card payment's move is taken back by appending the move that reverses it. A change-log entry is written with it. */
export async function unpairAccountPurchases(
  uid: string,
  encryption: RunwayEncryption,
  out: OpenPurchase,
  into: OpenPurchase,
  summary: string,
): Promise<{ out: OpenPurchase; into: OpenPurchase }> {
  if (out.pairedWithId !== into.id || into.pairedWithId !== out.id) {
    throw new Error(PAIR_WORDS.notPaired);
  }
  const [outSealed, inSealed, changeSealed] = await Promise.all([
    sealJson(
      {
        ...toSealedPayload(out),
        lines: getWaitingLines(out.amountCents),
        assignedBy: 'person',
        pairedWithId: null,
        pairKind: null,
        cardPaymentMoveId: null,
        tickedDayKey: null,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson(
      {
        ...toSealedPayload(into),
        lines: getWaitingLines(into.amountCents),
        assignedBy: 'person',
        pairedWithId: null,
        pairKind: null,
        cardPaymentMoveId: null,
        tickedDayKey: null,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
  ]);
  const changeId = generateUuid();
  const now = Math.max(Date.now(), out.updatedAt + 1, into.updatedAt + 1);

  await runTransaction(db, async (transaction) => {
    const [plan, leavePair] = await Promise.all([
      transaction.get(planRef(uid)),
      readPairExit(transaction, uid, encryption, into, now),
      readPairUnchanged(transaction, uid, out, into),
    ]);
    markLedgerWrite(transaction, uid, plan.data(), [out.date, into.date]);
    leavePair();
    transaction.update(purchaseRef(uid, out.id), {
      needsHome: true,
      updatedAt: now,
      sealed: outSealed,
    });
    transaction.update(purchaseRef(uid, into.id), {
      needsHome: true,
      updatedAt: now,
      sealed: inSealed,
    });
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'purchaseChange',
        createdAt: now,
        effectiveFrom: null,
        itemIds: [],
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
  await untickPairMove(uid, into);
  return {
    out: {
      ...out,
      lines: getWaitingLines(out.amountCents),
      needsHome: true,
      assignedBy: 'person',
      pairedWithId: null,
      pairKind: null,
      cardPaymentMoveId: null,
      tickedDayKey: null,
      updatedAt: now,
    },
    into: {
      ...into,
      lines: getWaitingLines(into.amountCents),
      needsHome: true,
      assignedBy: 'person',
      pairedWithId: null,
      pairKind: null,
      cardPaymentMoveId: null,
      tickedDayKey: null,
      updatedAt: now,
    },
  };
}

const imageRef = (uid: string, purchaseId: string, imageId: string) =>
  doc(
    db,
    'apps',
    'runway',
    'plans',
    uid,
    'purchases',
    purchaseId,
    'receiptImages',
    imageId,
  );

/** Moves receipt photos' documents to another purchase; each keeps the `purchaseId` its stored bytes sit under. */
function moveImages(
  transaction: Transaction,
  uid: string,
  images: readonly ReceiptImageDoc[],
  from: string,
  to: string,
) {
  images.forEach((image) => {
    transaction.set(imageRef(uid, to, image.id), image);
    transaction.delete(imageRef(uid, from, image.id));
  });
}

const readImages = async (uid: string, purchaseId: string) => {
  const found = await getDocs(
    collection(
      db,
      'apps',
      'runway',
      'plans',
      uid,
      'purchases',
      purchaseId,
      'receiptImages',
    ),
  );
  return found.docs.map((entry) => entry.data() as ReceiptImageDoc);
};

const toSealedPayload = (purchase: OpenPurchase): PurchaseSealed => ({
  amountCents: purchase.amountCents,
  merchant: purchase.merchant,
  label: purchase.label,
  note: purchase.note,
  lines: purchase.lines,
  refundOfId: purchase.refundOfId,
  paidByCardId: purchase.paidByCardId ?? null,
  link: purchase.link,
  receiptText: purchase.receiptText,
  costRef: purchase.costRef ?? null,
  notSameAs: purchase.notSameAs,
  incomeDayId: purchase.incomeDayId,
  assignedBy: purchase.assignedBy,
  pairedWithId: purchase.pairedWithId,
  pairKind: purchase.pairKind,
  cardPaymentMoveId: purchase.cardPaymentMoveId,
  tickedDayKey: purchase.tickedDayKey,
});

/** The typed purchase's envelopes on the bank's amount: a difference (a tip added when it posted) goes to the last part. */
function repriceTyped(typed: OpenPurchase, amountCents: Cents): PurchaseLine[] {
  const difference = amountCents - typed.amountCents;
  const lines = typed.lines.map((line, index) =>
    index === typed.lines.length - 1
      ? { ...line, cents: line.cents + difference }
      : line,
  );
  const isEmptied = (line: PurchaseLine, index: number) =>
    line.cents < 0 || (line.cents === 0 && typed.lines[index].cents !== 0);
  if (lines.some(isEmptied)) {
    throw new Error(
      'The bank’s amount is too far below one of its parts. Change the parts on the one you added first.',
    );
  }
  return lines;
}

export interface MergedPurchase {
  bank: OpenPurchase;
  typed: OpenPurchase;
  images: ReceiptImageDoc[];
  /** The merged purchase's `updatedAt`, which an Undo checks nothing has changed since. */
  updatedAt: number;
}

/** Makes a bank purchase and the one typed by hand for it one purchase: the bank's keeps its day, amount, status and id and takes the typed one's envelopes, name, note, receipt and photos, and the typed one is removed. Refused when another device changed either first. */
export async function mergeBankPurchase(
  uid: string,
  encryption: RunwayEncryption,
  bank: OpenPurchase,
  typed: OpenPurchase,
  summary: string,
): Promise<MergedPurchase> {
  const lines = repriceTyped(typed, bank.amountCents);
  const typedMerchant = typed.merchant?.trim() || null;
  const [sealed, changeSealed, images] = await Promise.all([
    sealJson(
      {
        ...toSealedPayload(typed),
        amountCents: bank.amountCents,
        merchant: bank.merchant ?? typedMerchant,
        label:
          typed.label ??
          (typedMerchant !== null && typedMerchant !== bank.merchant
            ? typedMerchant
            : null),
        lines,
        paidByCardId: bank.paidByCardId ?? null,
        notSameAs: null,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
    readImages(uid, typed.id),
  ]);
  const changeId = generateUuid();
  const now = Math.max(Date.now(), bank.updatedAt + 1);

  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, bank);
    await readUnchanged(transaction, uid, typed);
    const plan = await checkDayAndEnvelopes(
      transaction,
      uid,
      bank.date,
      lines,
      new Set(),
      bank.date,
      false,
      true,
    );
    markLedgerWrite(transaction, uid, plan, [bank.date, typed.date]);
    transaction.update(purchaseRef(uid, bank.id), {
      needsHome: false,
      expenseId: typed.expenseId,
      updatedAt: now,
      sealed,
    });
    transaction.delete(purchaseRef(uid, typed.id));
    moveImages(transaction, uid, images, typed.id, bank.id);
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'purchaseChange',
        createdAt: now,
        effectiveFrom: null,
        itemIds: getChangeItemIds(lines),
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
  return { bank, typed, images, updatedAt: now };
}

/** Undoes a merge: the typed purchase comes back as it was, marked as not this bank purchase so it is never matched to it again, and the bank's waits in Needs a home again. Refused when the merged purchase changed since. */
export async function splitBankPurchase(
  uid: string,
  encryption: RunwayEncryption,
  merged: MergedPurchase,
  summary: string,
): Promise<void> {
  const { bank, typed, images } = merged;
  const [typedSealed, bankSealed, changeSealed] = await Promise.all([
    sealJson(
      {
        ...toSealedPayload(typed),
        notSameAs: [...(typed.notSameAs ?? []), bank.id],
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson(toSealedPayload(bank), encryption),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
  ]);
  const changeId = generateUuid();

  await runTransaction(db, async (transaction) => {
    const [stored, typedStored, plan] = await Promise.all([
      transaction.get(purchaseRef(uid, bank.id)),
      transaction.get(purchaseRef(uid, typed.id)),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ]);
    if (
      !stored.exists() ||
      typedStored.exists() ||
      (stored.data() as PurchaseDoc).updatedAt !== merged.updatedAt
    ) {
      throw new Error(SPEND_WORDS.changedElsewhere);
    }
    const kept = await Promise.all(
      images.map((image) => transaction.get(imageRef(uid, bank.id, image.id))),
    );
    const stillThere = images.filter((_, index) => kept[index].exists());
    const now = Math.max(Date.now(), merged.updatedAt + 1);
    markLedgerWrite(transaction, uid, plan.data(), [bank.date, typed.date]);
    transaction.set(purchaseRef(uid, typed.id), {
      id: typed.id,
      date: typed.date,
      source: typed.source,
      status: null,
      needsHome: false,
      accountId: null,
      dedupeKey: null,
      expenseId: typed.expenseId,
      createdAt: typed.createdAt,
      updatedAt: now,
      sealed: typedSealed,
    } satisfies PurchaseDoc);
    transaction.update(purchaseRef(uid, bank.id), {
      needsHome: true,
      expenseId: bank.expenseId,
      updatedAt: now,
      sealed: bankSealed,
    });
    moveImages(transaction, uid, stillThere, bank.id, typed.id);
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
      {
        id: changeId,
        kind: 'purchaseChange',
        createdAt: now,
        effectiveFrom: null,
        itemIds: getChangeItemIds(bank.lines, typed.lines),
        sealed: changeSealed,
      } satisfies ChangeDoc,
    );
  });
}

/** Says a typed purchase is not these bank purchases, so they are never offered as the same again. Money does not move, so no change-log entry is written. */
export async function markNotSamePurchase(
  uid: string,
  encryption: RunwayEncryption,
  typed: OpenPurchase,
  bankIds: readonly string[],
): Promise<void> {
  const sealed = await sealJson(
    {
      ...toSealedPayload(typed),
      notSameAs: [...new Set([...(typed.notSameAs ?? []), ...bankIds])],
    } satisfies PurchaseSealed,
    encryption,
  );
  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, typed);
    transaction.update(purchaseRef(uid, typed.id), {
      updatedAt: Math.max(Date.now(), typed.updatedAt + 1),
      sealed,
    });
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
                HORIZON_END_WORDS.calledOffRemovePurchase,
              )
            : Promise.resolve(null),
        ]);
  const changeId = generateUuid();
  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, previous);
    const plan = await transaction.get(doc(db, 'apps', 'runway', 'plans', uid));
    const [isUnmarked, isReopenGone] =
      paid === null
        ? [true, false]
        : await Promise.all([
            isCostUnmarked(transaction, uid, paid),
            isReopenTaken(transaction, uid, reopen),
          ]);
    const isUnmarkNeeded = paid !== null && !isUnmarked;
    if (isUnmarkNeeded && isReopenGone) {
      throw new Error(HORIZON_END_WORDS.changedJustNow);
    }
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
  finished: FinishedHorizon | null = null,
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
