import { doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { toDayStamp } from '@apps/runway/engine/dates';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import { getStartMoveId } from '@apps/runway/store/actions/moveActions';
import type {
  CardDoc,
  CardPaymentSealed,
  CardSealed,
  Cents,
  DateOnly,
  MoveDoc,
  PlanDoc,
  RunwayEncryption,
  StartSealed,
} from '@apps/runway/types';

const cardRef = (uid: string, cardId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'cards', cardId);
const moveRef = (uid: string, moveId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'moves', moveId);
const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);

/** Payments to one card on one day, the nth being `_<n>`; several in a day are real (a part payment, then the rest). */
export const getCardPaymentMoveId = (
  cardId: string,
  date: DateOnly,
  count: number,
) => `cardpay_${cardId}_${toDayStamp(date)}_${count}`;

/** Takes back one card payment by naming it, so a second undo of it is the same id. */
export const getUndoCardPaymentMoveId = (moveId: string) =>
  `uncardpay_${moveId}`;

/** How many earlier payments of one card on one day are looked past, which the device may not have loaded. */
const MAX_PAYMENT_PROBES = 12;

/** Adds a card, and what it owed on the starting day as a `start` move in the same transaction. */
export async function createCard(
  uid: string,
  encryption: RunwayEncryption,
  input: CardSealed & { owedCents: Cents },
): Promise<string> {
  const id = generateUuid();
  const now = Date.now();
  const [sealed, startSealed] = await Promise.all([
    sealJson(
      {
        issuer: input.issuer,
        name: input.name,
        dueDay: input.dueDay,
      } satisfies CardSealed,
      encryption,
    ),
    sealJson(
      { amountCents: input.owedCents, holding: 'card' } satisfies StartSealed,
      encryption,
    ),
  ]);
  await runTransaction(db, async (transaction) => {
    const plan = await transaction.get(planRef(uid));
    const data = plan.data() as Partial<PlanDoc> | undefined;
    const startDate = data?.startDate ?? null;
    transaction.set(cardRef(uid, id), {
      id,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      sealed,
    } satisfies CardDoc);
    if (startDate === null || input.owedCents <= 0) return;
    markLedgerWrite(transaction, uid, data, [startDate]);
    const moveId = getStartMoveId(id, now);
    transaction.set(moveRef(uid, moveId), {
      id: moveId,
      kind: 'start',
      date: startDate,
      refId: id,
      reversesMoveId: null,
      createdAt: now,
      sealed: startSealed,
    } satisfies MoveDoc);
  });
  return id;
}

/** Changes a card's issuer, name or due day; only those fields and when it changed are written. */
export async function updateCard(
  uid: string,
  encryption: RunwayEncryption,
  cardId: string,
  input: CardSealed,
): Promise<void> {
  const sealed = await sealJson(
    {
      issuer: input.issuer,
      name: input.name,
      dueDay: input.dueDay,
    } satisfies CardSealed,
    encryption,
  );
  await updateDoc(cardRef(uid, cardId), { sealed, updatedAt: Date.now() });
}

/** Hides a card from new charges; what it was charged and paid stays in the ledger. */
export async function archiveCard(uid: string, cardId: string): Promise<void> {
  const now = Date.now();
  await updateDoc(cardRef(uid, cardId), { archivedAt: now, updatedAt: now });
}

export interface PayCardInput {
  cardId: string;
  amountCents: Cents;
  /** The day it was paid. */
  date: DateOnly;
  /** How many payments to this card on that day are already known, which the next id counts from. */
  count: number;
}

/** Records a card paid off on a day. Resolves with the move written, so an Undo can name it. */
export async function payCard(
  uid: string,
  encryption: RunwayEncryption,
  input: PayCardInput,
): Promise<string> {
  if (input.amountCents <= 0) throw new Error('Enter how much you paid.');
  const sealed = await sealJson(
    { amountCents: input.amountCents } satisfies CardPaymentSealed,
    encryption,
  );
  const id = await runTransaction(db, async (transaction) => {
    const plan = await transaction.get(planRef(uid));
    const findFree = async (count: number): Promise<string> => {
      if (count >= input.count + MAX_PAYMENT_PROBES) {
        throw new Error('Too many payments were saved to this card today.');
      }
      const moveId = getCardPaymentMoveId(input.cardId, input.date, count);
      const existing = await transaction.get(moveRef(uid, moveId));
      return existing.exists() ? findFree(count + 1) : moveId;
    };
    const moveId = await findFree(input.count + 1);
    markLedgerWrite(transaction, uid, plan.data(), [input.date]);
    transaction.set(moveRef(uid, moveId), {
      id: moveId,
      kind: 'cardPayment',
      date: input.date,
      refId: input.cardId,
      reversesMoveId: null,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    return moveId;
  });
  return id;
}

/** Takes a card payment back by appending a move that names it; the payment itself stays in the ledger. */
export async function undoCardPayment(
  uid: string,
  encryption: RunwayEncryption,
  paid: {
    moveId: string;
    cardId: string;
    date: DateOnly;
    amountCents: Cents;
  },
): Promise<void> {
  const id = getUndoCardPaymentMoveId(paid.moveId);
  const sealed = await sealJson(
    { amountCents: paid.amountCents } satisfies CardPaymentSealed,
    encryption,
  );
  await runTransaction(db, async (transaction) => {
    const [existing, plan] = await Promise.all([
      transaction.get(moveRef(uid, id)),
      transaction.get(planRef(uid)),
    ]);
    if (existing.exists()) return;
    markLedgerWrite(transaction, uid, plan.data(), [paid.date]);
    transaction.set(moveRef(uid, id), {
      id,
      kind: 'cardPayment',
      date: paid.date,
      refId: paid.cardId,
      reversesMoveId: paid.moveId,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
  });
}
