import { DAY_MS } from '@apps/runway/engine/dates';
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

/** How far back a store's refund with no order number looks for the purchase it returns. */
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

/** The order a store's refund or cancellation is for: the one purchase with the same order number, or, without a number, the one purchase from the same store within `STORE_REFUND_LOOKBACK_DAYS` before it with room left for it. Null when none, or more than one, fits. */
export function findStoreOrder(
  action: StoreAction,
  purchases: readonly OpenPurchase[],
): OpenPurchase | null {
  const key = toOrderKey(action.storeEmail.orderNumber);
  const others = purchases.filter(
    (purchase) => purchase.id !== action.id && purchase.amountCents > 0,
  );
  const fits = key
    ? others.filter(
        (purchase) => toOrderKey(purchase.storeEmail?.orderNumber) === key,
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

/** An order not yet charged by the bank: the email is still its own record, so a cancellation comes off it rather than coming back as a refund. */
export const isUnchargedOrder = (order: OpenPurchase) =>
  order.source === 'email';

/** Takes `cents` off an order's lines in proportion to what each took, so the lines still add up to the new amount. */
export function takeOffLines(
  lines: readonly PurchaseLine[],
  cents: Cents,
): PurchaseLine[] {
  const weights = lines.map((line) => Math.max(0, line.cents));
  const shares = allocate(
    cents,
    weights.some((weight) => weight > 0) ? weights : lines.map(() => 1),
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
  /** Comes back as a refund of the order, to where the order counted. */
  | { kind: 'refund'; lines: PurchaseLine[] }
  /** Tied to the order, but where it goes is the person's pick (an envelope the order took from is gone). */
  | { kind: 'tie' };

/** What a store's refund or cancellation does to its order: a cancellation of an order the bank has not charged comes off the order; anything else returns to where the order counted. Null when nothing is left to return. */
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
  if (action.storeEmail.kind === 'cancel' && isUnchargedOrder(order)) {
    return {
      kind: 'takeOff',
      cents,
      amountCents: order.amountCents - cents,
      lines: takeOffLines(order.lines, cents),
    };
  }
  if (action.amountCents === null || cents !== -action.amountCents) {
    return null;
  }
  const back = getRefundLines(cents, order, isLive, others);
  return back.kind === 'lines'
    ? { kind: 'refund', lines: back.lines }
    : { kind: 'tie' };
}
