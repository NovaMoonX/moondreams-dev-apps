import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { MAX_PURCHASE_CENTS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import type {
  ChangeDoc,
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
) => {
  const id = generateUuid();
  return {
    id,
    kind: 'moveChange',
    createdAt: Date.now(),
    effectiveFrom: null,
    itemIds,
    sealed: await sealJson(
      { summary, note } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
};

export interface MoveLeftoverInput {
  moveId: string;
  fromId: string;
  /** Null moves it to Free to Spend. */
  toId: string | null;
  cents: Cents;
  /** What the source envelope has left as this device reads it. */
  leftCents: Cents;
  note: string | null;
  /** The change-log sentence for this move. */
  summary: string;
}

const isStopped = (item: Partial<PlanItemDoc> | undefined) =>
  item === undefined || (item.archivedAt ?? null) !== null;

/** Moves money from an envelope to another envelope, a goal or Free to Spend; the total never changes. Resolves with the day it is dated, so an Undo can name it. */
export async function moveLeftover(
  uid: string,
  encryption: RunwayEncryption,
  input: MoveLeftoverInput,
): Promise<DateOnly> {
  if (input.cents <= 0 || input.cents > MAX_PURCHASE_CENTS) {
    throw new Error('Enter how much to move.');
  }
  if (input.cents > input.leftCents) {
    throw new Error('That is more than the envelope has left.');
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
      } satisfies TransferSealed,
      encryption,
    ),
    getChangeDoc(encryption, input.summary, noteText, [
      input.fromId,
      ...(input.toId === null ? [] : [input.toId]),
    ]),
  ]);
  await runTransaction(db, async (transaction) => {
    const [plan, from, to, existing] = await Promise.all([
      transaction.get(planRef(uid)),
      transaction.get(itemRef(uid, input.fromId)),
      input.toId === null
        ? Promise.resolve(null)
        : transaction.get(itemRef(uid, input.toId)),
      transaction.get(moveRef(uid, input.moveId)),
    ]);
    if (existing.exists()) return;
    const data = plan.data() as Partial<PlanDoc> | undefined;
    if (data?.startDate == null || data.startDate > date) {
      throw new Error('Money can be moved once your plan has started.');
    }
    if (isStopped(from.data() as Partial<PlanItemDoc> | undefined)) {
      throw new Error('That envelope was archived.');
    }
    if (
      to !== null &&
      isStopped(to.data() as Partial<PlanItemDoc> | undefined)
    ) {
      throw new Error('That place was archived. Pick another.');
    }
    markLedgerWrite(transaction, uid, data, [date]);
    transaction.set(moveRef(uid, input.moveId), {
      id: input.moveId,
      kind: 'transfer',
      date,
      refId: input.fromId,
      reversesMoveId: null,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    transaction.set(changeRef(uid, change.id), change);
  });
  return date;
}

export interface UndoTransferInput {
  moveId: string;
  date: DateOnly;
  fromId: string;
  toId: string | null;
  cents: Cents;
  note: string | null;
  /** The change-log sentence for taking it back. */
  summary: string;
}

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
      } satisfies TransferSealed,
      encryption,
    ),
    getChangeDoc(encryption, moved.summary, null, [
      moved.fromId,
      ...(moved.toId === null ? [] : [moved.toId]),
    ]),
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
      refId: moved.fromId,
      reversesMoveId: moved.moveId,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    transaction.set(changeRef(uid, change.id), change);
  });
}
