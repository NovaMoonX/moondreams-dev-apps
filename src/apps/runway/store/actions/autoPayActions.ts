import {
  doc,
  runTransaction,
  updateDoc,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { AUTO_PAY_WORDS } from '@apps/runway/constants';
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
import { toSealedPayload } from '@apps/runway/store/actions/purchaseActions';
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

/** How many marks of one payment are looked past to find the one a mark was written as. */
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

/** What a mark's replacement is: the same payment, paid on the same day with the same card, at another amount. */
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
  /** The mark being taken back, or null when the payment has none. */
  replace: WrittenPaidMark | null;
  /** The id the next mark is written under. */
  nextId: string;
}

/** Reads the payment's marks: refuses when the mark to replace is gone or already taken back, or a live mark is in the way. */
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

/** Takes back `slot.replace` and writes `next` in its place (either may be missing), with the one History entry that says what happened. */
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
  /** The mark as it stands now, which is taken back. */
  mark: WrittenPaidMark;
  amountCents: Cents;
  /** The charge the amount was read from; null when the person typed it. */
  purchaseId: string | null;
}

export interface CorrectedPaidAmount {
  /** The mark that was taken back. */
  replaced: WrittenPaidMark;
  written: WrittenPaidMark;
}

/** Changes what a payment came to: takes its mark back and marks it again at the real amount, paid the same day with the same card, in one transaction. */
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
    /** The mark that paid it, or null while none did. */
    paid: WrittenPaidMark | null;
    /** How many times it has been marked, undone marks included. */
    marks: number;
    /** What the bill holds toward a payment of the charge's amount; the rest comes out of Free to Spend. */
    fundedCents: Cents;
  };
  /** The card the mark is charged to; null for a bill pulled from the bank. */
  cardId: string | null;
  /** Whether the bill remembers this merchant's names. */
  learn: boolean;
  /** The person picked the charge (no pass changes it afterwards); false when the app matched it. */
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
  /** The mark the match wrote (a first mark, or the corrected one); null when the existing mark already had the amount. */
  written: WrittenPaidMark | null;
  /** The mark the match took back to correct it. */
  replaced: WrittenPaidMark | null;
  /** The names the bill had before and after the match; null before when it had none, null after when it learned nothing. */
  keysBefore: string[] | null;
  keysAfter: string[] | null;
}

const toMatchSealed = (keys: readonly string[]) =>
  ({ merchantKeys: [...keys] }) satisfies MatchSealed;

/** The names a header has learned; a header that has none or does not open has none. */
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

/** Newest first, no name twice, no more than a bill keeps. */
const mergeKeys = (added: readonly string[], kept: readonly string[]) =>
  [...new Set([...added, ...kept])].slice(0, AUTO_PAY_WORDS.maxLearnedNames);

/**
 * Settles a bill's payment with a bank charge in one transaction: the charge stops counting as spending (it has no lines, since the
 * payment's mark already put it on the card or took it from cash), the payment is marked paid at the charge's amount (or its mark
 * corrected to it), and the bill learns the merchant's names. Refused when the charge or the payment changed on another device first.
 */
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
    const isSameAmount = payment.paid?.amountCents === purchase.amountCents;
    const slot = isSameAmount
      ? null
      : await readMarkSlot(
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
    const written = slot
      ? await writeMarks(
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
        )
      : null;
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
            moveId: written?.moveId ?? payment.paid?.moveId ?? '',
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
      replaced: slot?.replace ?? null,
      keysBefore: before.length > 0 ? before : null,
      keysAfter: isLearned ? learned : null,
    } satisfies ChargeMatchResult;
  });
  return result;
}

/**
 * Undoes a match: the charge goes back to how it was (waiting, or with its envelopes), marked as the person's so no pass takes it again,
 * the mark it wrote is taken back and the one it replaced is put back, and the names it taught are forgotten. Refused when the charge
 * changed since.
 */
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

/** Makes a bill forget the merchant names it learned, so its next charge is matched by the bill's name again. */
export async function forgetBillMatch(
  uid: string,
  billId: string,
): Promise<void> {
  await updateDoc(itemRef(uid, billId), { matchSealed: null });
}
