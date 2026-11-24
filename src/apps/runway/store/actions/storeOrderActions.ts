import { doc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import { runHeldTransaction } from '@apps/runway/store/actions/heldTransaction';
import {
  getChangeItemIds,
  readUnchanged,
  toSealedPayload,
} from '@apps/runway/store/actions/purchaseActions';
import type {
  ChangeDoc,
  ChangeSealed,
  OpenPurchase,
  OrderLogEntry,
  PlanDoc,
  PurchaseLine,
  PurchaseSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const purchaseRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'purchases', id);
const changeRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'changes', id);

const sealChange = (summary: string, encryption: RunwayEncryption) =>
  sealJson({ summary, note: null } satisfies ChangeSealed, encryption);

const writeChange = (
  transaction: Parameters<Parameters<typeof runHeldTransaction>[1]>[0],
  uid: string,
  now: number,
  lines: readonly PurchaseLine[][],
  sealed: ChangeDoc['sealed'],
) => {
  const id = generateUuid();
  transaction.set(changeRef(uid, id), {
    id,
    kind: 'purchaseChange',
    createdAt: now,
    effectiveFrom: null,
    itemIds: getChangeItemIds(...lines),
    sealed,
  } satisfies ChangeDoc);
};

/** Ties a store's refund to its order and, given lines, sends the money back where the order counted; without lines it stays in Needs a home for the person to place. Refuses when the refund changed elsewhere. Resolves with the refund as written. */
export async function applyStoreRefund(
  uid: string,
  encryption: RunwayEncryption,
  refund: OpenPurchase,
  orderId: string,
  lines: PurchaseLine[] | null,
  summary: string,
): Promise<OpenPurchase> {
  const now = Math.max(Date.now(), refund.updatedAt + 1);
  const next: OpenPurchase = {
    ...refund,
    refundOfId: orderId,
    lines: lines ?? refund.lines,
    assignedBy: 'auto',
    needsHome: lines === null,
    updatedAt: now,
  };
  const [sealed, changeSealed] = await Promise.all([
    sealJson(toSealedPayload(next) satisfies PurchaseSealed, encryption),
    sealChange(summary, encryption),
  ]);
  await runHeldTransaction(uid, async (transaction) => {
    const plan = (await transaction.get(planRef(uid))).data() as
      Partial<PlanDoc> | undefined;
    await readUnchanged(transaction, uid, refund);
    markLedgerWrite(transaction, uid, plan, [refund.date]);
    transaction.update(purchaseRef(uid, refund.id), {
      needsHome: next.needsHome,
      updatedAt: now,
      sealed,
    });
    writeChange(
      transaction,
      uid,
      now,
      [refund.lines, next.lines],
      changeSealed,
    );
  });
  return next;
}

/** Undoes `applyStoreRefund`: the refund is untied and goes back to Needs a home on Free to Spend, marked as the person's so the app never ties it again. */
export async function undoStoreRefund(
  uid: string,
  encryption: RunwayEncryption,
  applied: OpenPurchase,
  summary: string,
): Promise<void> {
  const now = Math.max(Date.now(), applied.updatedAt + 1);
  const next: OpenPurchase = {
    ...applied,
    refundOfId: null,
    lines: [{ envelopeId: null, cents: applied.amountCents, via: 'free' }],
    assignedBy: 'person',
    needsHome: true,
    updatedAt: now,
  };
  const [sealed, changeSealed] = await Promise.all([
    sealJson(toSealedPayload(next), encryption),
    sealChange(summary, encryption),
  ]);
  await runHeldTransaction(uid, async (transaction) => {
    const plan = (await transaction.get(planRef(uid))).data() as
      Partial<PlanDoc> | undefined;
    await readUnchanged(transaction, uid, applied);
    markLedgerWrite(transaction, uid, plan, [applied.date]);
    transaction.update(purchaseRef(uid, applied.id), {
      needsHome: true,
      updatedAt: now,
      sealed,
    });
    writeChange(
      transaction,
      uid,
      now,
      [applied.lines, next.lines],
      changeSealed,
    );
  });
}

export interface TakeOff {
  amountCents: number;
  lines: PurchaseLine[];
  entry: OrderLogEntry;
}

/** Takes a cancellation off an order the bank has not charged: the order's amount and lines go down and the cancellation is logged on it, and the cancellation's own purchase (when the email gave an amount) keeps no lines, so it counts nowhere and waits for nothing, all in one transaction that refuses when either changed elsewhere. A fully cancelled order stops waiting for its bank. Resolves with the order and the cancellation as written. */
export async function takeOffOrder(
  uid: string,
  encryption: RunwayEncryption,
  order: OpenPurchase,
  cancel: OpenPurchase | null,
  takeOff: TakeOff,
  summary: string,
): Promise<{ order: OpenPurchase; cancel: OpenPurchase | null }> {
  const now = Math.max(
    Date.now(),
    order.updatedAt + 1,
    (cancel?.updatedAt ?? 0) + 1,
  );
  const kept: OpenPurchase | null =
    cancel === null
      ? null
      : {
          ...cancel,
          lines: [],
          assignedBy: 'auto',
          needsHome: false,
          emailWaiting: false,
          updatedAt: now,
        };
  const next: OpenPurchase = {
    ...order,
    amountCents: takeOff.amountCents,
    lines: takeOff.lines,
    orderLog: [...(order.orderLog ?? []), takeOff.entry],
    emailWaiting: takeOff.amountCents === 0 ? false : order.emailWaiting,
    updatedAt: now,
  };
  const [sealed, keptSealed, changeSealed] = await Promise.all([
    sealJson(toSealedPayload(next), encryption),
    kept === null ? null : sealJson(toSealedPayload(kept), encryption),
    sealChange(summary, encryption),
  ]);
  await runHeldTransaction(uid, async (transaction) => {
    const plan = (await transaction.get(planRef(uid))).data() as
      Partial<PlanDoc> | undefined;
    await readUnchanged(transaction, uid, order);
    if (cancel !== null) await readUnchanged(transaction, uid, cancel);
    markLedgerWrite(transaction, uid, plan, [order.date, cancel?.date ?? null]);
    transaction.update(purchaseRef(uid, order.id), {
      emailWaiting: next.emailWaiting,
      updatedAt: now,
      sealed,
    });
    if (kept !== null && keptSealed !== null) {
      transaction.update(purchaseRef(uid, kept.id), {
        needsHome: false,
        emailWaiting: false,
        updatedAt: now,
        sealed: keptSealed,
      });
    }
    writeChange(transaction, uid, now, [order.lines, next.lines], changeSealed);
  });
  return { order: next, cancel: kept };
}

/** Undoes `takeOffOrder`: the order counts as it did before, its log keeps the entry marked undone so the app never takes it off again, and the cancellation counts again as money in waiting in Needs a home, the person's to place. Refuses when either changed since. */
export async function undoTakeOff(
  uid: string,
  encryption: RunwayEncryption,
  before: OpenPurchase,
  written: OpenPurchase,
  cancel: OpenPurchase | null,
  emailEventId: string | null,
  summary: string,
): Promise<void> {
  const now = Math.max(Date.now(), written.updatedAt + 1);
  const undoneAt = Date.now();
  const order: OpenPurchase = {
    ...before,
    orderLog: (written.orderLog ?? []).map((entry) =>
      entry.emailEventId === emailEventId && entry.undoneAt === null
        ? { ...entry, undoneAt }
        : entry,
    ),
    updatedAt: now,
  };
  const back: OpenPurchase | null =
    cancel === null
      ? null
      : {
          ...cancel,
          lines: [{ envelopeId: null, cents: cancel.amountCents, via: 'free' }],
          assignedBy: 'person',
          needsHome: true,
          updatedAt: Math.max(now, cancel.updatedAt + 1),
        };
  const [orderSealed, backSealed, changeSealed] = await Promise.all([
    sealJson(toSealedPayload(order), encryption),
    back === null ? null : sealJson(toSealedPayload(back), encryption),
    sealChange(summary, encryption),
  ]);
  await runHeldTransaction(uid, async (transaction) => {
    const plan = (await transaction.get(planRef(uid))).data() as
      Partial<PlanDoc> | undefined;
    await readUnchanged(transaction, uid, written);
    if (cancel !== null) await readUnchanged(transaction, uid, cancel);
    markLedgerWrite(transaction, uid, plan, [before.date, back?.date ?? null]);
    transaction.update(purchaseRef(uid, before.id), {
      emailWaiting: before.emailWaiting,
      updatedAt: now,
      sealed: orderSealed,
    });
    if (back !== null && backSealed !== null) {
      transaction.update(purchaseRef(uid, back.id), {
        needsHome: true,
        updatedAt: back.updatedAt,
        sealed: backSealed,
      });
    }
    writeChange(
      transaction,
      uid,
      now,
      [written.lines, before.lines],
      changeSealed,
    );
  });
}
