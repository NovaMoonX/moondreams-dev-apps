import { doc, runTransaction, type Transaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { MAX_PURCHASE_LINES, SPEND_WORDS } from '@apps/runway/constants';
import {
  getCountedFrom,
  isInTrackingPeriods,
  sumLines,
} from '@apps/runway/engine/purchases';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import type {
  Cents,
  DateOnly,
  OpenPurchase,
  ChangeDoc,
  ChangeSealed,
  PlanDoc,
  PlanItemDoc,
  PurchaseDoc,
  PurchaseLine,
  PurchaseSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const purchaseRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'purchases', id);

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
}

/** Adds a purchase by hand; the plan and each envelope are read fresh in the same transaction, so a day outside tracking or an archived envelope is refused. */
export async function addPurchase(
  uid: string,
  encryption: RunwayEncryption,
  input: AddPurchaseInput,
): Promise<string> {
  if (input.amountCents === 0) throw new Error('Enter an amount.');
  if (input.lines.length === 0 || input.lines.length > MAX_PURCHASE_LINES) {
    throw new Error('Pick where it comes from.');
  }
  if (sumLines(input.lines) !== input.amountCents) {
    throw new Error('The parts do not add up to the amount.');
  }

  const id = generateUuid();
  const sealed = await sealJson(
    {
      amountCents: input.amountCents,
      merchant: input.merchant,
      label: input.label,
      note: input.note,
      lines: input.lines,
      refundOfId: input.refundOfId,
      paidByCardId: input.paidByCardId,
    } satisfies PurchaseSealed,
    encryption,
  );

  await runTransaction(db, async (transaction) => {
    const plan = await checkDayAndEnvelopes(
      transaction,
      uid,
      input.date,
      input.lines,
      new Set(),
      null,
    );

    const now = Date.now();
    markLedgerWrite(transaction, uid, plan, [input.date]);
    transaction.set(purchaseRef(uid, id), {
      id,
      date: input.date,
      source: 'manual',
      needsHome: false,
      createdAt: now,
      updatedAt: now,
      sealed,
    } satisfies PurchaseDoc);
  });
  return id;
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
      `Tracking was not on for ${formatDateUTC(date)}. Pick a day you were tracking.`,
    );
  }
  const countedFrom = getCountedFrom(periods);
  const isKept = keptDate === date && countedFrom !== null;
  if (!isKept && (countedFrom === null || date < countedFrom)) {
    throw new Error(
      countedFrom === null
        ? 'Tracking is off, probably from another device. Reopen Runway to see where it stands.'
        : `Tracking started again on ${formatDateUTC(countedFrom)}, and an earlier day is not counted. Pick that day or a later one.`,
    );
  }
  const isGone = envelopes.some((snapshot) => {
    const item = snapshot.data() as PlanItemDoc | undefined;
    return !item || item.kind !== 'envelope' || item.archivedAt !== null;
  });
  if (isGone) {
    throw new Error(
      'An envelope you picked was archived or removed on another device. Pick again.',
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
  const [sealed, changeSealed] = await Promise.all([
    sealJson(
      {
        amountCents: input.amountCents,
        merchant: input.merchant,
        label: input.label,
        note: input.note,
        lines: input.lines,
        refundOfId: input.refundOfId,
        paidByCardId: input.paidByCardId,
      } satisfies PurchaseSealed,
      encryption,
    ),
    sealJson({ summary, note: null } satisfies ChangeSealed, encryption),
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
    transaction.update(purchaseRef(uid, previous.id), {
      date: input.date,
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

/** Removes a purchase (its lines go with it, so the envelopes and Free to spend recover). Refused when another device changed or removed it first; a change-log entry is written with it. */
export async function deletePurchase(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenPurchase,
  summary: string,
): Promise<void> {
  const changeSealed = await sealJson(
    { summary, note: null } satisfies ChangeSealed,
    encryption,
  );
  const changeId = generateUuid();
  await runTransaction(db, async (transaction) => {
    await readUnchanged(transaction, uid, previous);
    const plan = await transaction.get(doc(db, 'apps', 'runway', 'plans', uid));
    markLedgerWrite(transaction, uid, plan.data(), [previous.date]);
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
