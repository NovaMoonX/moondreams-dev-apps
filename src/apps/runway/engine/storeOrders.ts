import { DAY_MS } from '@apps/runway/engine/dates';
import { findEmailTwins } from '@apps/runway/engine/emailTwins';
import { isRefundCandidate, isSameStore } from '@apps/runway/engine/matching';
import { allocate } from '@apps/runway/engine/money';
import {
  getRefundableCents,
  getRefundLines,
} from '@apps/runway/engine/purchases';
import type {
  Cents,
  DateOnly,
  OpenPurchase,
  PurchaseLine,
  StoreEmail,
} from '@apps/runway/types';

/** How far back a refund with no order number looks for its purchase. */
export const STORE_REFUND_LOOKBACK_DAYS = 60;

/** What a refund or cancellation from a store's email asks of an order. */
export interface StoreAction {
  id: string;
  storeEmail: StoreEmail;
  merchant: string | null;
  date: DateOnly;
  /** Negative, the money it returns; null for a whole-order cancellation that gave no amount. */
  amountCents: Cents | null;
}

/** An order number compared without case, spaces or punctuation; null when too short to tell orders apart. */
export const toOrderKey = (orderNumber: string | null | undefined) => {
  const key = (orderNumber ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key.length >= 4 && /[0-9]/.test(key) ? key : null;
};

const nameOf = (purchase: Pick<OpenPurchase, 'merchant' | 'label'>) =>
  purchase.merchant?.trim() || purchase.label?.trim() || null;

/** A refund or cancellation read from a store's email that the app has not tied to its order yet, and that nobody has answered. */
export const isOpenStoreAction = (purchase: OpenPurchase) =>
  (purchase.storeEmail?.kind === 'refund' ||
    purchase.storeEmail?.kind === 'cancel') &&
  purchase.amountCents < 0 &&
  purchase.refundOfId === null &&
  purchase.assignedBy === null &&
  purchase.ruleId === null &&
  purchase.needsHome;

/** The one same-store purchase with the order's number, or without one, the one within the lookback with room left; null otherwise. */
export function findStoreOrder(
  action: StoreAction,
  purchases: readonly OpenPurchase[],
): OpenPurchase | null {
  const key = toOrderKey(action.storeEmail.orderNumber);
  const others = purchases.filter(
    (purchase) => purchase.id !== action.id && purchase.amountCents > 0,
  );
  if (action.merchant === null) return null;
  const fits = key
    ? others.filter(
        (purchase) =>
          toOrderKey(purchase.storeEmail?.orderNumber) === key &&
          isSameStore(nameOf(purchase), action.merchant),
      )
    : others.filter(
        (purchase) =>
          (isRefundCandidate(purchase) || purchase.source === 'email') &&
          purchase.pairedWithId === null &&
          purchase.date <= action.date &&
          purchase.date >= action.date - STORE_REFUND_LOOKBACK_DAYS * DAY_MS &&
          isSameStore(nameOf(purchase), action.merchant) &&
          (action.amountCents === null ||
            getRefundableCents(purchase, purchases) >= -action.amountCents),
      );
  return fits.length === 1 ? fits[0] : null;
}

/** An order the bank has not charged: still its email's own record, with no bank charge that may be it. */
export const isUnchargedOrder = (
  order: OpenPurchase,
  purchases: readonly OpenPurchase[],
) =>
  order.source === 'email' &&
  (findEmailTwins(purchases).candidates.get(order.id) ?? []).length === 0;

/** An emailed order still waiting for its bank, which may yet replace it, so nothing is tied to it. */
const isAwaitingBank = (order: OpenPurchase) =>
  order.source === 'email' && order.emailWaiting === true;

/** Takes `cents` off an order's lines in proportion, so they still add up; a line on an envelope that is gone takes none. */
export function takeOffLines(
  lines: readonly PurchaseLine[],
  cents: Cents,
  isLive: (envelopeId: string) => boolean = () => true,
): PurchaseLine[] | null {
  const weights = lines.map((line) =>
    line.envelopeId === null || isLive(line.envelopeId)
      ? Math.max(0, line.cents)
      : 0,
  );
  if (weights.reduce((sum, weight) => sum + weight, 0) < cents) return null;
  const shares = allocate(
    cents,
    weights,
    lines.map((_, index) => String(index).padStart(3, '0')),
  );
  return lines.map((line, index) => ({
    ...line,
    cents: line.cents - shares[index],
  }));
}

export type StorePlan =
  /** Comes off the uncharged order itself. */
  | { kind: 'takeOff'; cents: Cents; amountCents: Cents; lines: PurchaseLine[] }
  /** Comes back as a refund of the order, to where the order counted; at Link it is the bank's own refund (`bankId`) that is placed. */
  | { kind: 'refund'; lines: PurchaseLine[]; bankId: string | null }
  /** Tied to the order, but where it goes is the person's pick (an envelope the order took from is gone). */
  | { kind: 'tie'; bankId: string | null };

/** The bank's own refund an emailed one is: the one open money in from the same store for the same amount, from three days before to ten after. */
export function findBankRefund(
  action: StoreAction,
  purchases: readonly OpenPurchase[],
): OpenPurchase | null {
  const fits = purchases.filter(
    (purchase) =>
      purchase.source === 'link' &&
      purchase.amountCents === action.amountCents &&
      purchase.refundOfId === null &&
      purchase.assignedBy === null &&
      purchase.pairedWithId === null &&
      purchase.incomeDayId === null &&
      purchase.date >= action.date - 3 * DAY_MS &&
      purchase.date <= action.date + 10 * DAY_MS &&
      isSameStore(nameOf(purchase), action.merchant),
  );
  return fits.length === 1 ? fits[0] : null;
}

/** Null when nothing is left to return, the bank may yet replace the order, or the same cancellation was already taken off. */
export function planStoreAction(
  action: StoreAction,
  order: OpenPurchase,
  purchases: readonly OpenPurchase[],
  isLive: (envelopeId: string) => boolean,
): StorePlan | null {
  const others = purchases.filter((purchase) => purchase.id !== action.id);
  const left = getRefundableCents(order, others);
  const asked = action.amountCents === null ? left : -action.amountCents;
  const cents = Math.min(asked, left);
  if (cents <= 0) return null;
  if (action.storeEmail.kind === 'cancel' && order.source === 'email') {
    if (!isUnchargedOrder(order, purchases)) return null;
    const isRepeat = (order.orderLog ?? []).some(
      (entry) =>
        entry.undoneAt === null &&
        entry.cents === cents &&
        Math.abs(entry.on - action.date) <= 2 * DAY_MS,
    );
    const lines = takeOffLines(order.lines, cents, isLive);
    if (isRepeat || lines === null) return null;
    return {
      kind: 'takeOff',
      cents,
      amountCents: order.amountCents - cents,
      lines,
    };
  }
  if (isAwaitingBank(order)) return null;
  const bankId =
    order.source === 'link'
      ? (findBankRefund(action, purchases)?.id ?? null)
      : null;
  if (order.source === 'link' && bankId === null) return null;
  if (action.amountCents === null || cents !== -action.amountCents) {
    return null;
  }
  const back = getRefundLines(cents, order, isLive, others);
  return back.kind === 'lines'
    ? { kind: 'refund', lines: back.lines, bankId }
    : { kind: 'tie', bankId };
}
