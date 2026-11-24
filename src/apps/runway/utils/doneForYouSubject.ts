import type { DoneForYouSubject, OpenPurchase } from '@apps/runway/types';

/** A subject with every key written, so a pass names only what it has. */
export const toSubject = (
  known: Partial<DoneForYouSubject>,
): DoneForYouSubject => ({
  purchaseId: null,
  merchant: null,
  merchantLogo: null,
  amountCents: null,
  ruleId: null,
  billId: null,
  itemId: null,
  toName: null,
  toEmoji: null,
  fromName: null,
  ...known,
});

/** The purchase an entry acted on, as its merchant, logo and amount. */
export const toPurchaseSubject = (
  purchase: OpenPurchase,
  known: Partial<DoneForYouSubject> = {},
): DoneForYouSubject =>
  toSubject({
    purchaseId: purchase.id,
    merchant: purchase.merchant ?? purchase.label ?? null,
    merchantLogo: purchase.merchantLogo ?? null,
    amountCents: purchase.amountCents,
    ...known,
  });
