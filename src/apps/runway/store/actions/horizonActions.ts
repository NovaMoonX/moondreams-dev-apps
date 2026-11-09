import {
  doc,
  runTransaction,
  writeBatch,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';

import {
  COST_PAID_WORDS,
  HORIZON_END_WORDS,
  HORIZON_PLAN_WORDS,
  MAKE_BILL_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getNextVersionId,
  setHorizonState,
  type CostPaidEntry,
} from '@apps/runway/engine/horizon';
import { removeLinks } from '@apps/runway/engine/horizonLinks';
import { newTransferMoveId } from '@apps/runway/store/actions/transferActions';
import { getCostPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import {
  buildGroupDocs,
  prepareCancel,
  readCancel,
  type CancelChangeInput,
} from '@apps/runway/store/actions/itemActions';
import {
  assertPlanStarted,
  assertSourceLive,
  getUndoTransferMoveId,
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
  HorizonLink,
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
  /** The change-log sentence; defaults to "Added <name>.". */
  summary?: string;
  /** Other items the change entry is listed on, such as the goal the event draws from. */
  alsoItemIds?: string[];
  /** Closes the envelope the money comes from in the same write, with its own history line; needs `toward` from an envelope. */
  archive?: { summary: string } | null;
}

/**
 * Adds a Horizon item as a header, a first version and one change entry in a single write: a batch,
 * or a transaction that also carries the move of money put toward it. Items and versions are created
 * and never updated; nothing is written to `days`.
 */
export async function addHorizon(
  uid: string,
  encryption: RunwayEncryption,
  {
    horizonId,
    horizon,
    startDate,
    toward,
    summary,
    alsoItemIds = [],
    archive = null,
  }: AddHorizonInput,
): Promise<{ horizonId: string }> {
  const now = Date.now();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = {
    summary: summary ?? `Added ${horizon.name}.`,
  };
  const archiveId = generateUuid();

  const [horizonSealed, changeSealed, archiveSealed] = await Promise.all([
    sealJson(horizon, encryption),
    sealJson(changePayload, encryption),
    archive
      ? sealJson(
          { summary: archive.summary } satisfies ChangeSealed,
          encryption,
        )
      : Promise.resolve(null),
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
    itemIds: [horizonId, ...alsoItemIds],
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
    if (archive && archiveSealed && toward.fromId !== null) {
      const fromData = from?.data() as Partial<PlanItemDoc> | undefined;
      if ((fromData?.archivedAt ?? null) !== null) {
        throw new Error(HORIZON_PLAN_WORDS.envelopeAlreadyClosed);
      }
      transaction.update(planDoc(uid, 'items', toward.fromId), {
        archivedAt: startDate,
      });
      transaction.set(planDoc(uid, 'changes', archiveId), {
        id: archiveId,
        kind: 'planChange',
        createdAt: now,
        effectiveFrom: startDate,
        itemIds: [toward.fromId, horizonId],
        sealed: archiveSealed,
      } satisfies ChangeDoc);
    }
  });

  return { horizonId };
}

/** The goal that paid part of a cost's payment, with what it paid. */
export interface GoalPart {
  goalId: string;
  goalName: string;
  cents: Cents;
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
  /** The part the event's linked goal pays, taken before the event's own money; null when the event has no goal or it holds nothing. */
  goal: GoalPart | null;
  /** How many times this payment has been marked before, undone marks included. */
  marks: number;
}

/** The names a cost payment's History entries and toasts are written with. */
export interface CostPaidNames {
  item: string;
  cost: string;
  /** The linked goal's name when it paid part of the payment. */
  goal?: string | null;
}

export type WrittenCostPaid = {
  moveId: string;
  itemId: string;
} & CostPaidSealed &
  Pick<CostPaidEntry, 'fromGoalCents' | 'goalId'>;

const getGoalOf = (paid: WrittenCostPaid, names: CostPaidNames) =>
  paid.goalId !== null && paid.fromGoalCents > 0
    ? {
        name: names.goal ?? COST_PAID_WORDS.goalFallbackName,
        cents: paid.fromGoalCents,
      }
    : null;

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
    getGoalOf(paid, names),
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
            fromGoalCents: paid.fromGoalCents,
            goalId: paid.goalId,
            goalName: names.goal ?? null,
          },
        },
      } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
}

/** The History entry on the goal for a payment of its event that took money from it, or that gave it back; null when the goal paid nothing. */
export async function getGoalPaidChange(
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: CostPaidNames,
  isUndo: boolean,
): Promise<ChangeDoc | null> {
  if (paid.goalId === null || paid.fromGoalCents <= 0) return null;
  const words = isUndo
    ? COST_PAID_WORDS.goalUndoSummary
    : COST_PAID_WORDS.goalSummary;
  return {
    id: generateUuid(),
    kind: 'planChange',
    createdAt: Date.now(),
    effectiveFrom: null,
    itemIds: [paid.goalId],
    sealed: await sealJson(
      {
        summary: words(names.cost, names.item, formatCents(paid.fromGoalCents)),
      } satisfies ChangeSealed,
      encryption,
    ),
  };
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
  const goal = input.mark === 'outside' ? null : input.goal;
  const payload: CostPaidSealed &
    Pick<CostPaidEntry, 'fromGoalCents' | 'goalId'> = {
    costId: input.costId,
    dueOn: input.dueOn,
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    fromFreeCents: input.mark === 'outside' ? 0 : input.fromFreeCents,
    mark: input.mark,
    purchaseId: null,
    fromGoalCents: goal?.cents ?? 0,
    goalId: goal?.goalId ?? null,
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
    const names = {
      item: input.itemName,
      cost: input.costName,
      goal: goal?.goalName ?? null,
    };
    const change = await getCostPaidChange(encryption, mark, names, false);
    const goalChange = await getGoalPaidChange(encryption, mark, names, false);
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
    if (goalChange) {
      transaction.set(planDoc(uid, 'changes', goalChange.id), goalChange);
    }
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
      fromGoalCents: paid.fromGoalCents,
      goalId: paid.goalId,
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

/** Whether another write already took the version a reopen would stand on; read before any write in the transaction. */
export const isReopenTaken = async (
  transaction: Transaction,
  uid: string,
  reopen: SealedReopen | null,
) =>
  reopen !== null &&
  (await transaction.get(planDoc(uid, 'versions', reopen.version.id))).exists();

/** Appends the move that reverses a mark, and its History entry, to a transaction that has read `isCostUnmarked` as false; the caller marks the ledger, once for all it writes. */
export function setCostUnmark(
  transaction: Transaction,
  uid: string,
  paid: WrittenCostPaid,
  sealed: Sealed,
  change: ChangeDoc,
  reopen: SealedReopen | null = null,
  goalChange: ChangeDoc | null = null,
) {
  if (goalChange) {
    transaction.set(planDoc(uid, 'changes', goalChange.id), goalChange);
  }
  if (reopen) {
    transaction.set(
      planDoc(uid, 'versions', reopen.version.id),
      reopen.version,
    );
    transaction.set(planDoc(uid, 'changes', reopen.change.id), reopen.change);
  }
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

/** The version that reopens a finished event, and its History entry, sealed and ready to join the transaction that takes a paid mark back. */
export interface SealedReopen {
  version: PlanVersionDoc;
  change: ChangeDoc;
}

/** A finished or called-off event and the id of the version it was read from, which a write that reopens it names its own after. */
export interface FinishedHorizon {
  horizon: HorizonSealed;
  versionId: string;
}

/** Seals the reopening of a finished event because one of its paid marks is taken back; the version starts today. */
export async function sealReopen(
  encryption: RunwayEncryption,
  { horizon: finished, versionId }: FinishedHorizon,
  itemId: string,
  costName: string,
  on: DateOnly,
  blocked: (name: string) => string = HORIZON_END_WORDS.calledOffTakeBack,
): Promise<SealedReopen> {
  if (finished.state === 'calledOff') {
    throw new Error(blocked(finished.name));
  }
  const now = Date.now();
  const changeId = generateUuid();
  const [sealed, changeSealed] = await Promise.all([
    sealJson(setHorizonState(finished, 'open', on, null), encryption),
    sealJson(
      {
        summary: HORIZON_END_WORDS.reopenSummary(finished.name, costName),
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  return {
    version: {
      id: getNextVersionId(versionId),
      itemId,
      kind: 'horizon',
      createdAt: now,
      effectiveFrom: on,
      effectiveUntil: null,
      changeId,
      sealed,
    },
    change: {
      id: changeId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: on,
      itemIds: [itemId],
      sealed: changeSealed,
    },
  };
}

/** Undoes a cost's paid mark by appending a move that names it; the mark itself stays in the ledger. A `finished` event is reopened in the same transaction. Resolves false when it was already taken back. */
export async function undoCostPaid(
  uid: string,
  encryption: RunwayEncryption,
  paid: WrittenCostPaid,
  names: CostPaidNames,
  finished: FinishedHorizon | null = null,
  on: DateOnly = todayAsUtcDate(),
): Promise<boolean> {
  const sealed = await sealCostUnmark(encryption, paid);
  const reopen =
    finished === null
      ? null
      : await sealReopen(encryption, finished, paid.itemId, names.cost, on);
  const isWritten = await runTransaction(db, async (transaction) => {
    const [isDone, plan, isReopenGone] = await Promise.all([
      isCostUnmarked(transaction, uid, paid),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      isReopenTaken(transaction, uid, reopen),
    ]);
    if (isDone) return false;
    if (isReopenGone) throw new Error(HORIZON_END_WORDS.changedJustNow);
    const change = await getCostPaidChange(encryption, paid, names, true);
    const goalChange = await getGoalPaidChange(encryption, paid, names, true);
    markLedgerWrite(transaction, uid, plan.data(), [paid.dueOn]);
    setCostUnmark(transaction, uid, paid, sealed, change, reopen, goalChange);
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
  /** The id of the version of the item `horizon` was made from; its next version is named after it, so a second write from the same one is refused. */
  baseVersionId?: string;
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

  const itemVersionId =
    input.baseVersionId === undefined
      ? generateUuid()
      : getNextVersionId(input.baseVersionId);
  return runTransaction(db, async (transaction) => {
    const [plan, item, existing, taken] = await Promise.all([
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      transaction.get(planDoc(uid, 'items', input.itemId)),
      transaction.get(planDoc(uid, 'items', input.billId)),
      transaction.get(planDoc(uid, 'versions', itemVersionId)),
    ]);
    if (existing.exists()) throw new Error(MAKE_BILL_WORDS.alreadyDone);
    if (taken.exists()) throw new Error(HORIZON_END_WORDS.changedJustNow);
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
    const itemVersion = {
      ...version(input.itemId, 'horizon', horizonSealed),
      id: itemVersionId,
    };
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

/** The money one change of state moves, between the event and Free to Spend (null), an envelope or a goal. */
export interface HorizonMoneyMove {
  /** Made once by the caller, so a retry resolves to the same move. */
  moveId: string;
  /** Null takes it from Free to Spend. */
  fromId: string | null;
  /** Null moves it to Free to Spend. */
  toId: string | null;
  cents: Cents;
  /** The day the move is dated: today, or the original's day for one that reverses it. */
  date: DateOnly;
  /** What the source has left as this device reads it; not read when the move reverses an earlier one. */
  leftCents: Cents;
}

export interface SetHorizonStateInput {
  /** Made once by the caller, so a retry writes the same version. */
  versionId: string;
  itemId: string;
  /** The event as it will stand, state and where its money went included. */
  horizon: HorizonSealed;
  summary: string;
  note: string | null;
  /** The day the version starts. */
  on: DateOnly;
  move: HorizonMoneyMove | null;
  /** The move reverses the one it names (an Undo), so it is written under the id that names it. */
  isUndo?: boolean;
  /** Other items the change entry is listed on, such as the goal an event draws from. */
  alsoItemIds?: string[];
  /** Changes that have not started, cancelled in this same transaction; one already cancelled or started refuses the whole write. */
  cancels?: readonly CancelChangeInput[];
}

/**
 * Writes an event's next state (finished, called off, open again, or its money released) as one transaction:
 * a whole-payload version from `on`, one `planChange` and, when money moves, the `transfer`. The version's id
 * is the caller's, so a second tap or another device finds it written and resolves false. The header is
 * untouched: `endedAt` and `archivedAt` are write-once, and an event can come back.
 */
export async function setHorizonStateWith(
  uid: string,
  encryption: RunwayEncryption,
  input: SetHorizonStateInput,
): Promise<boolean> {
  const now = Date.now();
  const changeId = generateUuid();
  const { move, isUndo = false } = input;
  const moveId = move
    ? isUndo
      ? getUndoTransferMoveId(move.moveId)
      : move.moveId
    : null;
  if (move && (move.cents <= 0 || move.fromId === move.toId)) {
    throw new Error(HORIZON_END_WORDS.badMove);
  }
  if (move && !isUndo && move.cents > move.leftCents) {
    throw new Error(HORIZON_END_WORDS.notEnough);
  }
  const placeIds = [move?.fromId, move?.toId].filter(
    (id): id is string => typeof id === 'string' && id !== input.itemId,
  );
  const [horizonSealed, changeSealed, moveSealed, cancels] = await Promise.all([
    sealJson(input.horizon, encryption),
    sealJson(
      { summary: input.summary, note: input.note } satisfies ChangeSealed,
      encryption,
    ),
    move
      ? sealJson(
          {
            fromId: move.fromId,
            toId: move.toId,
            cents: move.cents,
            note: null,
            isOutside: false,
          } satisfies TransferSealed,
          encryption,
        )
      : Promise.resolve(null),
    Promise.all(
      (input.cancels ?? []).map((cancel) => prepareCancel(encryption, cancel)),
    ),
  ]);

  return runTransaction(db, async (transaction) => {
    const [[plan, item, version, existing, ...places], writes] =
      await Promise.all([
        Promise.all([
          transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
          transaction.get(planDoc(uid, 'items', input.itemId)),
          transaction.get(planDoc(uid, 'versions', input.versionId)),
          moveId === null
            ? Promise.resolve(null)
            : transaction.get(planDoc(uid, 'moves', moveId)),
          ...(isUndo
            ? []
            : placeIds.map((id) => transaction.get(planDoc(uid, 'items', id)))),
        ]),
        Promise.all(
          cancels.map((cancel) => readCancel(transaction, uid, cancel)),
        ),
      ]);
    if (version.exists() || existing?.exists()) return false;
    if (!item.exists()) throw new Error(HORIZON_END_WORDS.gone);
    if (writes.includes(null))
      throw new Error(HORIZON_END_WORDS.changedJustNow);
    if (move) assertPlanStarted(plan.data(), move.date);
    places.forEach((place) => {
      assertSourceLive(place.data() as Partial<PlanItemDoc> | undefined);
    });
    transaction.set(planDoc(uid, 'versions', input.versionId), {
      id: input.versionId,
      itemId: input.itemId,
      kind: 'horizon',
      createdAt: now,
      effectiveFrom: input.on,
      effectiveUntil: null,
      changeId,
      sealed: horizonSealed,
    } satisfies PlanVersionDoc);
    transaction.set(planDoc(uid, 'changes', changeId), {
      id: changeId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: input.on,
      itemIds: [input.itemId, ...placeIds, ...(input.alsoItemIds ?? [])],
      sealed: changeSealed,
    } satisfies ChangeDoc);
    writes.forEach((write) => write?.());
    if (move && moveId !== null && moveSealed !== null) {
      markLedgerWrite(transaction, uid, plan.data(), [
        ...new Set([input.on, move.date]),
      ]);
      transaction.set(planDoc(uid, 'moves', moveId), {
        id: moveId,
        kind: 'transfer',
        date: move.date,
        refId: move.fromId ?? move.toId,
        reversesMoveId: isUndo ? move.moveId : null,
        createdAt: now,
        sealed: moveSealed,
      } satisfies MoveDoc);
    }
    return true;
  });
}

/** Where the money an event holds goes when it is finished or called off. */
export type HorizonWhere =
  | { kind: 'free' }
  | { kind: 'keep' }
  | { kind: 'place'; toId: string; name: string };

/** What a change of state wrote, which its Undo needs to write the opposite. */
export interface HorizonStateWritten {
  itemId: string;
  versionId: string;
  /** The event as it stood before, state and all. */
  before: HorizonSealed;
  /** The event as it stands now. */
  after: HorizonSealed;
  move: HorizonMoneyMove | null;
}

interface EndHorizonInput {
  itemId: string;
  /** The open event as the device reads it just before the write. */
  horizon: HorizonSealed;
  /** The id of the version `horizon` was read from; the write is named after it, so a second device working from the same version finds it taken. */
  baseVersionId: string;
  today: DateOnly;
  /** What the event holds as the device reads it; below zero counts as zero. */
  leftCents: Cents;
  where: HorizonWhere;
  note: string | null;
  /** Links the called-off version drops: changes the person kept without the event, or cancelled in the same write. */
  unlinks?: readonly HorizonLink[];
  /** Changes cancelled in the same transaction; their links are in `unlinks`, and an Undo reopens the event only. */
  cancels?: readonly CancelChangeInput[];
}

async function endHorizon(
  uid: string,
  encryption: RunwayEncryption,
  state: 'finished' | 'calledOff',
  input: EndHorizonInput,
): Promise<HorizonStateWritten | null> {
  const { horizon, today, where } = input;
  const left = Math.max(0, input.leftCents);
  const moveId = newTransferMoveId();
  const toId = where.kind === 'place' ? where.toId : null;
  const move: HorizonMoneyMove | null =
    left > 0 && where.kind !== 'keep'
      ? {
          moveId,
          fromId: input.itemId,
          toId,
          cents: left,
          date: today,
          leftCents: left,
        }
      : null;
  const money: HorizonSealed['stateMoney'] =
    left <= 0
      ? null
      : {
          kind: where.kind === 'keep' ? 'held' : where.kind,
          toId,
          cents: left,
          moveId: move === null ? null : moveId,
        };
  const after = removeLinks(
    setHorizonState(horizon, state, today, money),
    input.unlinks ?? [],
  );
  const before = removeLinks(
    horizon,
    (input.cancels ?? []).map(({ itemId, changeId }) => ({ itemId, changeId })),
  );
  const versionId = getNextVersionId(input.baseVersionId);
  const summary = HORIZON_END_WORDS.endSummary(
    horizon.name,
    state,
    money === null
      ? null
      : {
          kind: money.kind,
          cents: formatCents(money.cents),
          place: where.kind === 'place' ? where.name : null,
        },
  );
  const isWritten = await setHorizonStateWith(uid, encryption, {
    versionId,
    itemId: input.itemId,
    horizon: after,
    summary,
    note: input.note,
    on: today,
    move,
    cancels: input.cancels,
  });
  return isWritten
    ? { itemId: input.itemId, versionId, before, after, move }
    : null;
}

/** Finishes an event whose costs are all settled; resolves null when another device already changed it. */
export const finishHorizon = (
  uid: string,
  encryption: RunwayEncryption,
  input: EndHorizonInput,
) => endHorizon(uid, encryption, 'finished', input);

/** Calls an event off: its unpaid costs stop asking from today, what is paid and the bills it made stay. */
export const callOffHorizon = (
  uid: string,
  encryption: RunwayEncryption,
  input: EndHorizonInput,
) => endHorizon(uid, encryption, 'calledOff', input);

export interface BringBackInput {
  itemId: string;
  /** The called-off event as the device reads it just before the write. */
  horizon: HorizonSealed;
  baseVersionId: string;
  today: DateOnly;
  /** What comes back from where the call-off sent it; zero starts the event at nothing. */
  bringCents: Cents;
  /** What the place it went to, or Free to Spend, has now. */
  availableCents: Cents;
}

/** Reopens a called-off event from today, bringing its money back from where it went when the person said so. */
export async function bringBackHorizon(
  uid: string,
  encryption: RunwayEncryption,
  input: BringBackInput,
): Promise<HorizonStateWritten | null> {
  const { horizon, today, bringCents } = input;
  const sent = horizon.stateMoney;
  const move: HorizonMoneyMove | null =
    bringCents > 0 && sent !== null && sent.kind !== 'held'
      ? {
          moveId: newTransferMoveId(),
          fromId: sent.kind === 'place' ? sent.toId : null,
          toId: input.itemId,
          cents: bringCents,
          date: today,
          leftCents: input.availableCents,
        }
      : null;
  const after = setHorizonState(horizon, 'open', today, null);
  const versionId = getNextVersionId(input.baseVersionId);
  const isWritten = await setHorizonStateWith(uid, encryption, {
    versionId,
    itemId: input.itemId,
    horizon: after,
    summary: HORIZON_END_WORDS.bringBackSummary(
      horizon.name,
      move === null ? null : formatCents(move.cents),
    ),
    note: null,
    on: today,
    move,
  });
  return isWritten
    ? { itemId: input.itemId, versionId, before: horizon, after, move }
    : null;
}

export interface ReleaseHorizonInput {
  itemId: string;
  /** The finished or called-off event that kept its money held. */
  horizon: HorizonSealed;
  baseVersionId: string;
  today: DateOnly;
  /** What it holds now; zero releases nothing. */
  leftCents: Cents;
}

/** Releases the money a finished or called-off event kept held to Free to Spend; the event keeps its state. */
export async function releaseHorizonHeld(
  uid: string,
  encryption: RunwayEncryption,
  input: ReleaseHorizonInput,
): Promise<HorizonStateWritten | null> {
  const { horizon, today } = input;
  const cents = Math.max(0, input.leftCents);
  if (cents <= 0) return null;
  const moveId = newTransferMoveId();
  const move: HorizonMoneyMove = {
    moveId,
    fromId: input.itemId,
    toId: null,
    cents,
    date: today,
    leftCents: cents,
  };
  const after: HorizonSealed = {
    ...horizon,
    stateMoney: { kind: 'free', toId: null, cents, moveId },
  };
  const versionId = getNextVersionId(input.baseVersionId);
  const isWritten = await setHorizonStateWith(uid, encryption, {
    versionId,
    itemId: input.itemId,
    horizon: after,
    summary: HORIZON_END_WORDS.releaseSummary(horizon.name, formatCents(cents)),
    note: null,
    on: today,
    move,
  });
  return isWritten
    ? { itemId: input.itemId, versionId, before: horizon, after, move }
    : null;
}

/** Writes the opposite of a change of state: the payload from before, from today, and the reversal of the move it made. `holds` is what the reversal takes the money back from has now; short of the move, nothing is written. Resolves false when it was already undone. */
export async function undoHorizonState(
  uid: string,
  encryption: RunwayEncryption,
  written: HorizonStateWritten,
  summary: string,
  today: DateOnly,
  holds: { cents: Cents; name: string },
): Promise<boolean> {
  if (written.move && written.move.cents > holds.cents) {
    throw new Error(HORIZON_END_WORDS.undoShort(holds.name));
  }
  return setHorizonStateWith(uid, encryption, {
    versionId: getNextVersionId(written.versionId),
    itemId: written.itemId,
    horizon: written.before,
    summary,
    note: null,
    on: today,
    move: written.move,
    isUndo: true,
  });
}
