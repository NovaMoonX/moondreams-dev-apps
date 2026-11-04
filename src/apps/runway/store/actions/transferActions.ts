import { doc, runTransaction, type Transaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { MAX_PURCHASE_CENTS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import type {
  ChangeDoc,
  ChangeMove,
  ChangeSealed,
  Cents,
  DateOnly,
  MoveDoc,
  PlanDoc,
  PlanItemDoc,
  RunwayEncryption,
  TransferSealed,
} from '@apps/runway/types';

const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const itemRef = (uid: string, itemId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'items', itemId);
const moveRef = (uid: string, moveId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'moves', moveId);
const changeRef = (uid: string, changeId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId);

/** The id of a new move of money, made when its view opens so a save tried again writes it once. */
export const newTransferMoveId = () => `transfer_${generateUuid()}`;

/** Takes one move of money back by naming it, so a second undo of it is the same id. */
export const getUndoTransferMoveId = (moveId: string) => `untransfer_${moveId}`;

const getChangeDoc = async (
  encryption: RunwayEncryption,
  summary: string,
  note: string | null,
  itemIds: string[],
  move: ChangeMove,
) => {
  const id = generateUuid();
  return {
    id,
    kind: 'moveChange',
    createdAt: Date.now(),
    effectiveFrom: null,
    itemIds,
    sealed: await sealJson(
      { summary, note, move } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
};

export interface MoveLeftoverInput {
  moveId: string;
  /** Null takes it from Free to Spend. */
  fromId: string | null;
  /** Null moves it to Free to Spend. */
  toId: string | null;
  cents: Cents;
  /** From, or to, outside the plan rather than Free to Spend. */
  isOutside: boolean;
  /** What the source envelope has left as this device reads it; ignored when `fromId` is null. */
  leftCents: Cents;
  note: string | null;
  /** The change-log sentence for this move. */
  summary: string;
  /** What taking it back restores, kept on the log entry so History can offer the Undo. */
  undoText: string;
}

const getItemIds = (fromId: string | null, toId: string | null) =>
  [fromId, toId].filter((id): id is string => id !== null);

const isStopped = (item: Partial<PlanItemDoc> | undefined) =>
  item === undefined || (item.archivedAt ?? null) !== null;

/** Checks a move and seals it with its change entry; nothing is written. */
export async function sealMoveLeftover(
  encryption: RunwayEncryption,
  input: MoveLeftoverInput,
) {
  if (input.cents <= 0 || input.cents > MAX_PURCHASE_CENTS) {
    throw new Error('Enter how much to move.');
  }
  if (input.fromId !== null && input.cents > input.leftCents) {
    throw new Error('That is more than it has left.');
  }
  if (input.toId === input.fromId) {
    throw new Error('Pick somewhere else to move it to.');
  }
  const date = todayAsUtcDate();
  const noteText = input.note === null || input.note === '' ? null : input.note;
  const [sealed, change] = await Promise.all([
    sealJson(
      {
        fromId: input.fromId,
        toId: input.toId,
        cents: input.cents,
        note: noteText,
        isOutside: input.isOutside,
      } satisfies TransferSealed,
      encryption,
    ),
    getChangeDoc(
      encryption,
      input.summary,
      noteText,
      getItemIds(input.fromId, input.toId),
      {
        moveId: input.moveId,
        bill: null,
        date,
        fromId: input.fromId,
        toId: input.toId,
        cents: input.cents,
        note: noteText,
        isOutside: input.isOutside,
        undoText: input.undoText,
        isUndo: false,
      },
    ),
  ]);
  return { date, sealed, change };
}

export type SealedMove = Awaited<ReturnType<typeof sealMoveLeftover>>;

/** Throws when the plan has not started by the move's day. */
export function assertPlanStarted(
  plan: Partial<PlanDoc> | undefined,
  date: DateOnly,
) {
  if (plan?.startDate == null || plan.startDate > date) {
    throw new Error('Money can be moved once your plan has started.');
  }
}

/** Throws when a source item is archived or gone. */
export function assertSourceLive(item: Partial<PlanItemDoc> | undefined) {
  if (isStopped(item)) throw new Error('That one was archived.');
}

/** Writes a sealed move and its change entry inside a transaction that has read the plan; the ledger is marked. */
export function writeSealedMove(
  transaction: Transaction,
  uid: string,
  moveId: string,
  plan: Partial<PlanDoc> | undefined,
  { date, sealed, change }: SealedMove,
  refId: string | null,
) {
  markLedgerWrite(transaction, uid, plan, [date]);
  transaction.set(moveRef(uid, moveId), {
    id: moveId,
    kind: 'transfer',
    date,
    refId,
    reversesMoveId: null,
    createdAt: Date.now(),
    sealed,
  } satisfies MoveDoc);
  transaction.set(changeRef(uid, change.id), change);
}

/** Moves money from an envelope to another envelope, a goal or Free to Spend; money on hand changes only for an `isOutside` move. Resolves with the day it is dated, so an Undo can name it. */
export async function moveLeftover(
  uid: string,
  encryption: RunwayEncryption,
  input: MoveLeftoverInput,
): Promise<DateOnly> {
  const sealedMove = await sealMoveLeftover(encryption, input);
  await runTransaction(db, async (transaction) => {
    const [plan, from, to, existing] = await Promise.all([
      transaction.get(planRef(uid)),
      input.fromId === null
        ? Promise.resolve(null)
        : transaction.get(itemRef(uid, input.fromId)),
      input.toId === null
        ? Promise.resolve(null)
        : transaction.get(itemRef(uid, input.toId)),
      transaction.get(moveRef(uid, input.moveId)),
    ]);
    if (existing.exists()) return;
    const data = plan.data() as Partial<PlanDoc> | undefined;
    assertPlanStarted(data, sealedMove.date);
    if (from !== null) {
      assertSourceLive(from.data() as Partial<PlanItemDoc> | undefined);
    }
    if (
      to !== null &&
      isStopped(to.data() as Partial<PlanItemDoc> | undefined)
    ) {
      throw new Error('That place was archived. Pick another.');
    }
    writeSealedMove(
      transaction,
      uid,
      input.moveId,
      data,
      sealedMove,
      input.fromId ?? input.toId,
    );
  });
  return sealedMove.date;
}

export type UndoTransferInput = Omit<ChangeMove, 'isUndo'>;

/** Takes a move of money back by appending a move that names it; the move itself stays in the ledger. */
export async function undoTransfer(
  uid: string,
  encryption: RunwayEncryption,
  moved: UndoTransferInput,
): Promise<void> {
  const id = getUndoTransferMoveId(moved.moveId);
  const [sealed, change] = await Promise.all([
    sealJson(
      {
        fromId: moved.fromId,
        toId: moved.toId,
        cents: moved.cents,
        note: moved.note,
        isOutside: moved.isOutside,
      } satisfies TransferSealed,
      encryption,
    ),
    getChangeDoc(
      encryption,
      `${moved.undoText}.`,
      null,
      getItemIds(moved.fromId, moved.toId),
      { ...moved, isUndo: true },
    ),
  ]);
  await runTransaction(db, async (transaction) => {
    const [existing, plan] = await Promise.all([
      transaction.get(moveRef(uid, id)),
      transaction.get(planRef(uid)),
    ]);
    if (existing.exists()) return;
    markLedgerWrite(transaction, uid, plan.data(), [moved.date]);
    transaction.set(moveRef(uid, id), {
      id,
      kind: 'transfer',
      date: moved.date,
      refId: moved.fromId ?? moved.toId,
      reversesMoveId: moved.moveId,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    transaction.set(changeRef(uid, change.id), change);
  });
}
