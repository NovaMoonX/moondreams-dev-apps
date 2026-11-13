import {
  doc,
  getDoc,
  runTransaction,
  updateDoc,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { AUTO_PAY_DAYS, AUTO_PAY_WORDS } from '@apps/runway/constants';
import { getMerchantKeys } from '@apps/runway/engine/autoPay';
import { getPaidMoveId, getUndoMoveId } from '@apps/runway/engine/progress';
import { openJson, sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import {
  changeRef,
  findOpenMarkId,
  getPaymentChange,
  moveRef,
  type WrittenPaidMark,
} from '@apps/runway/store/actions/moveActions';
import {
  getWaitingLines,
  toSealedPayload,
} from '@apps/runway/store/actions/purchaseActions';
import type {
  BillPaidSealed,
  Cents,
  DateOnly,
  MatchSealed,
  MoveDoc,
  OpenPurchase,
  PlanDoc,
  PlanItemDoc,
  PurchaseDoc,
  PurchaseSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const itemRef = (uid: string, itemId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'items', itemId);
const purchaseRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'purchases', id);

const MARK_INDEX_LIMIT = 12;

const getMarkIndex = (mark: WrittenPaidMark) => {
  const index = Array.from({ length: MARK_INDEX_LIMIT }, (_, at) => at).find(
    (at) => getPaidMoveId(mark.billId, mark.dueOn, at) === mark.moveId,
  );
  if (index === undefined) throw new Error(AUTO_PAY_WORDS.changedElsewhere);
  return index;
};

const toPaidPayload = (mark: WrittenPaidMark): BillPaidSealed => ({
  amountCents: mark.amountCents,
  paidOn: mark.paidOn,
  fromFreeCents: mark.fromFreeCents,
  cardId: mark.cardId ?? null,
  auto: mark.auto ?? null,
});

const toReplacement = (
  old: WrittenPaidMark,
  amountCents: Cents,
  auto: BillPaidSealed['auto'],
): Omit<WrittenPaidMark, 'moveId'> => ({
  billId: old.billId,
  dueOn: old.dueOn,
  amountCents,
  paidOn: old.paidOn,
  fromFreeCents: Math.max(
    0,
    amountCents - (old.amountCents - old.fromFreeCents),
  ),
  cardId: old.cardId ?? null,
  auto,
});

interface MarkSlot {
  replace: WrittenPaidMark | null;
  nextId: string;
}

/** Refuses when the mark to replace is gone or already taken back, or a live mark is in the way. */
async function readMarkSlot(
  transaction: Transaction,
  uid: string,
  billId: string,
  dueOn: DateOnly,
  replace: WrittenPaidMark | null,
  marks: number,
): Promise<MarkSlot> {
  const [oldMove, oldUndone] = await Promise.all(
    replace
      ? [
          transaction.get(moveRef(uid, replace.moveId)),
          transaction.get(moveRef(uid, getUndoMoveId(replace.moveId))),
        ]
      : [null, null],
  );
  if (replace && (!oldMove?.exists() || oldUndone?.exists())) {
    throw new Error(AUTO_PAY_WORDS.changedElsewhere);
  }
  const start = replace ? getMarkIndex(replace) + 1 : marks;
  const nextId = await findOpenMarkId(transaction, uid, billId, dueOn, start);
  if (nextId === null) throw new Error(AUTO_PAY_WORDS.changedElsewhere);
  return { replace, nextId };
}

/** Takes back `slot.replace` and writes `next` in its place, with one History entry. */
async function writeMarks(
  transaction: Transaction,
  uid: string,
  encryption: RunwayEncryption,
  slot: MarkSlot,
  next: Omit<WrittenPaidMark, 'moveId'> | null,
  billName: string,
  summary: string,
): Promise<WrittenPaidMark | null> {
  if (slot.replace) {
    const id = getUndoMoveId(slot.replace.moveId);
    transaction.set(moveRef(uid, id), {
      id,
      kind: 'billPaid',
      date: slot.replace.dueOn,
      refId: slot.replace.billId,
      reversesMoveId: slot.replace.moveId,
      createdAt: Date.now(),
      sealed: await sealJson(toPaidPayload(slot.replace), encryption),
    } satisfies MoveDoc);
  }
  const written: WrittenPaidMark | null = next
    ? { ...next, moveId: slot.nextId }
    : null;
  if (written) {
    transaction.set(moveRef(uid, slot.nextId), {
      id: slot.nextId,
      kind: 'billPaid',
      date: written.dueOn,
      refId: written.billId,
      reversesMoveId: null,
      createdAt: Date.now(),
      sealed: await sealJson(toPaidPayload(written), encryption),
    } satisfies MoveDoc);
  }
  const entry = written ?? slot.replace;
  if (entry) {
    const change = await getPaymentChange(
      encryption,
      entry,
      billName,
      written === null,
      written ? summary : null,
    );
    transaction.set(changeRef(uid, change.id), change);
  }
  return written;
}

export interface CorrectPaidAmountInput {
  billId: string;
  billName: string;
  mark: WrittenPaidMark;
  amountCents: Cents;
  purchaseId: string | null;
}

export interface CorrectedPaidAmount {
  replaced: WrittenPaidMark;
  written: WrittenPaidMark;
}

/** Replaces a payment's mark with one at the real amount. */
export async function correctPaidAmount(
  uid: string,
  encryption: RunwayEncryption,
  input: CorrectPaidAmountInput,
): Promise<CorrectedPaidAmount> {
  const { mark } = input;
  const result = await runTransaction(db, async (transaction) => {
    const plan = await transaction.get(planRef(uid));
    const slot = await readMarkSlot(
      transaction,
      uid,
      mark.billId,
      mark.dueOn,
      mark,
      0,
    );
    markLedgerWrite(transaction, uid, plan.data(), [mark.dueOn]);
    const written = await writeMarks(
      transaction,
      uid,
      encryption,
      slot,
      toReplacement(mark, input.amountCents, {
        isEstimate: false,
        purchaseId: input.purchaseId,
      }),
      input.billName,
      AUTO_PAY_WORDS.correctedSummary(
        input.billName,
        formatDateOrdinalUTC(mark.dueOn),
        formatCents(input.amountCents),
      ),
    );
    if (!written) throw new Error(AUTO_PAY_WORDS.changedElsewhere);
    return { replaced: mark, written };
  });
  return result;
}

export interface MatchChargeInput {
  /** The charge as the store holds it; the write is refused when it has changed since. */
  purchase: OpenPurchase;
  bill: { id: string; name: string };
  payment: {
    dueOn: DateOnly;
    paid: WrittenPaidMark | null;
    /** Undone marks included. */
    marks: number;
    fundedCents: Cents;
  };
  cardId: string | null;
  learn: boolean;
  /** False when the app matched it: no pass changes a charge the person picked. */
  isPicked: boolean;
}

/** What an Undo of a match needs. */
export interface ChargeMatchResult {
  /** The charge as it was before the match. */
  purchase: OpenPurchase;
  billId: string;
  billName: string;
  dueOn: DateOnly;
  /** The charge's `updatedAt` after the match, which an Undo checks nothing has changed since. */
  updatedAt: number;
  written: WrittenPaidMark | null;
  replaced: WrittenPaidMark | null;
  keysBefore: string[] | null;
  keysAfter: string[] | null;
}

const toMatchSealed = (keys: readonly string[]) =>
  ({ merchantKeys: [...keys] }) satisfies MatchSealed;

async function readKeys(
  header: Partial<PlanItemDoc> | undefined,
  encryption: RunwayEncryption,
): Promise<string[]> {
  if (!header?.matchSealed) return [];
  try {
    const payload = await openJson<MatchSealed>(header.matchSealed, encryption);
    return Array.isArray(payload.merchantKeys) ? payload.merchantKeys : [];
  } catch {
    return [];
  }
}

const mergeKeys = (added: readonly string[], kept: readonly string[]) =>
  [...new Set([...added, ...kept])].slice(0, AUTO_PAY_DAYS.maxLearnedNames);

/** Settles a payment with a bank charge: the charge loses its lines, the mark is settled, the bill learns the names. */
export async function matchChargeToBill(
  uid: string,
  encryption: RunwayEncryption,
  input: MatchChargeInput,
): Promise<ChargeMatchResult> {
  const { purchase, bill, payment } = input;
  const result = await runTransaction(db, async (transaction) => {
    const [plan, stored, header] = await Promise.all([
      transaction.get(planRef(uid)),
      transaction.get(purchaseRef(uid, purchase.id)),
      transaction.get(itemRef(uid, bill.id)),
    ]);
    if (
      !stored.exists() ||
      (stored.data() as PurchaseDoc).updatedAt !== purchase.updatedAt
    ) {
      throw new Error(AUTO_PAY_WORDS.changedElsewhere);
    }
    const slot = await readMarkSlot(
      transaction,
      uid,
      bill.id,
      payment.dueOn,
      payment.paid,
      payment.marks,
    );
    const before = await readKeys(
      header.data() as Partial<PlanItemDoc> | undefined,
      encryption,
    );
    const learned = input.learn
      ? mergeKeys(getMerchantKeys(purchase), before)
      : before;
    const isLearned = learned.join('|') !== before.join('|');
    markLedgerWrite(transaction, uid, plan.data(), [
      purchase.date,
      payment.dueOn,
    ]);
    const written = await writeMarks(
      transaction,
      uid,
      encryption,
      slot,
      payment.paid
        ? toReplacement(payment.paid, purchase.amountCents, {
            isEstimate: false,
            purchaseId: purchase.id,
          })
        : {
            billId: bill.id,
            dueOn: payment.dueOn,
            amountCents: purchase.amountCents,
            paidOn: payment.dueOn,
            fromFreeCents: Math.max(
              0,
              purchase.amountCents - payment.fundedCents,
            ),
            cardId: input.cardId,
            auto: { isEstimate: false, purchaseId: purchase.id },
          },
      bill.name,
      AUTO_PAY_WORDS.matchedSummary(
        bill.name,
        formatDateOrdinalUTC(payment.dueOn),
        formatCents(purchase.amountCents),
      ),
    );
    const now = Math.max(Date.now(), purchase.updatedAt + 1);
    transaction.update(purchaseRef(uid, purchase.id), {
      needsHome: false,
      updatedAt: now,
      sealed: await sealJson(
        {
          ...toSealedPayload(purchase),
          lines: [],
          ruleId: null,
          assignedBy: input.isPicked ? 'person' : 'auto',
          billRef: {
            billId: bill.id,
            dueOn: payment.dueOn,
            moveId: written?.moveId ?? '',
          },
        } satisfies PurchaseSealed,
        encryption,
      ),
    });
    if (isLearned) {
      transaction.update(itemRef(uid, bill.id), {
        matchSealed: await sealJson(toMatchSealed(learned), encryption),
      });
    }
    return {
      purchase,
      billId: bill.id,
      billName: bill.name,
      dueOn: payment.dueOn,
      updatedAt: now,
      written,
      replaced: slot.replace,
      keysBefore: before.length > 0 ? before : null,
      keysAfter: isLearned ? learned : null,
    } satisfies ChargeMatchResult;
  });
  return result;
}

/** Undoes a match; refused when the charge changed since. */
export async function undoChargeMatch(
  uid: string,
  encryption: RunwayEncryption,
  match: ChargeMatchResult,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const [plan, stored, header] = await Promise.all([
      transaction.get(planRef(uid)),
      transaction.get(purchaseRef(uid, match.purchase.id)),
      transaction.get(itemRef(uid, match.billId)),
    ]);
    if (
      !stored.exists() ||
      (stored.data() as PurchaseDoc).updatedAt !== match.updatedAt
    ) {
      throw new Error(AUTO_PAY_WORDS.changedElsewhere);
    }
    const slot = match.written
      ? await readMarkSlot(
          transaction,
          uid,
          match.billId,
          match.dueOn,
          match.written,
          0,
        )
      : null;
    const current = await readKeys(
      header.data() as Partial<PlanItemDoc> | undefined,
      encryption,
    );
    markLedgerWrite(transaction, uid, plan.data() as Partial<PlanDoc>, [
      match.purchase.date,
      match.dueOn,
    ]);
    if (slot) {
      await writeMarks(
        transaction,
        uid,
        encryption,
        slot,
        match.replaced
          ? toReplacement(
              match.replaced,
              match.replaced.amountCents,
              match.replaced.auto ?? null,
            )
          : null,
        match.billName,
        AUTO_PAY_WORDS.matchUndoneSummary(
          match.billName,
          formatDateOrdinalUTC(match.dueOn),
        ),
      );
    }
    transaction.update(purchaseRef(uid, match.purchase.id), {
      needsHome: match.purchase.needsHome,
      updatedAt: Math.max(Date.now(), match.updatedAt + 1),
      sealed: await sealJson(
        {
          ...toSealedPayload(match.purchase),
          ruleId: null,
          assignedBy: 'person',
          billRef: null,
        } satisfies PurchaseSealed,
        encryption,
      ),
    });
    if (
      match.keysAfter !== null &&
      current.join('|') === match.keysAfter.join('|')
    ) {
      transaction.update(itemRef(uid, match.billId), {
        matchSealed:
          match.keysBefore === null
            ? null
            : await sealJson(toMatchSealed(match.keysBefore), encryption),
      });
    }
  });
}

export interface UnmatchChargeInput {
  purchase: OpenPurchase;
  billName: string;
  mark: WrittenPaidMark | null;
  restore: { amountCents: Cents; isEstimate: boolean } | null;
}

/** Takes a matched charge off its bill; the mark goes back to an estimate when `restore` says so. */
export async function unmatchBillCharge(
  uid: string,
  encryption: RunwayEncryption,
  input: UnmatchChargeInput,
): Promise<void> {
  const { purchase, mark, restore } = input;
  const ref = purchase.billRef;
  if (!ref) throw new Error(AUTO_PAY_WORDS.changedElsewhere);
  const isOwnMark = mark !== null && mark.auto?.purchaseId === purchase.id;
  await undoChargeMatch(uid, encryption, {
    purchase: {
      ...purchase,
      lines: getWaitingLines(purchase.amountCents),
      needsHome: true,
      billRef: null,
    },
    billId: ref.billId,
    billName: input.billName,
    dueOn: ref.dueOn,
    updatedAt: purchase.updatedAt,
    written: isOwnMark ? mark : null,
    replaced:
      isOwnMark && restore
        ? {
            ...mark,
            amountCents: restore.amountCents,
            fromFreeCents: Math.max(
              0,
              restore.amountCents - (mark.amountCents - mark.fromFreeCents),
            ),
            auto: { isEstimate: restore.isEstimate, purchaseId: null },
          }
        : null,
    keysBefore: null,
    keysAfter: null,
  });
}

/** Makes a bill forget the merchant names it learned, so its next charge is matched by the bill's name again. */
export async function forgetBillMatch(
  uid: string,
  billId: string,
): Promise<void> {
  await updateDoc(itemRef(uid, billId), { matchSealed: null });
}

/** Teaches a bill the merchant names its bank charges go by, so a charge or repeating charge named so is read as this bill. */
export async function learnBillMerchant(
  uid: string,
  encryption: RunwayEncryption,
  billId: string,
  keys: readonly string[],
): Promise<void> {
  const header = await getDoc(itemRef(uid, billId));
  const before = await readKeys(
    header.data() as Partial<PlanItemDoc> | undefined,
    encryption,
  );
  const learned = mergeKeys(keys, before);
  if (learned.join('|') === before.join('|')) return;
  await updateDoc(itemRef(uid, billId), {
    matchSealed: await sealJson(toMatchSealed(learned), encryption),
  });
}
