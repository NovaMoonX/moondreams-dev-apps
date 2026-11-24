import type { MerchantNameDoc } from '../merchantNames.js';

const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type Known = Pick<MerchantNameDoc, 'name' | 'logo' | 'category'>;

export interface EmailPurchaseView {
  needsHome: boolean;
  createdAt: number;
  updatedAt: number;
  merchantCheckedAt: number | null;
  payload: Record<string, unknown>;
}

export interface EmailPurchaseFill {
  /** Set only when the purchase moves into Needs a home. */
  needsHome: true | null;
  /** The sealed fields to change; null when none change. */
  patch: Record<string, unknown> | null;
}

/** Nothing the person or a pass has answered: one write at ingest, never touched since (a client write always moves `updatedAt`), every line free and unplaced. */
const isUnanswered = (view: EmailPurchaseView) => {
  const { payload } = view;
  const lines = Array.isArray(payload.lines)
    ? (payload.lines as { envelopeId?: unknown }[])
    : [];
  return (
    !view.needsHome &&
    view.updatedAt === view.createdAt &&
    lines.length > 0 &&
    lines.every((line) => (line.envelopeId ?? null) === null) &&
    [
      payload.assignedBy,
      payload.ruleId,
      payload.pairedWithId,
      payload.incomeDayId,
      payload.cardPaymentMoveId,
      payload.tickedDayKey,
    ].every((value) => (value ?? null) === null)
  );
};

/**
 * What to change on an emailed purchase already stored: an unanswered one moves into Needs a home, and one the merchant
 * list knows gets its clean name (only while untouched, so a name the person typed stays), logo and category (never over one
 * already there). Null when nothing changes and the purchase was checked within the week or already has a logo.
 */
export function planEmailPurchaseFill(
  view: EmailPurchaseView,
  known: Known | null,
  now: number,
): EmailPurchaseFill | null {
  const { payload } = view;
  const needsHome = isUnanswered(view) ? true : null;
  const hasLogo = Boolean(payload.merchantLogo);
  const wasChecked =
    view.merchantCheckedAt !== null &&
    now - view.merchantCheckedAt < RETRY_AFTER_MS;
  if (needsHome === null && (hasLogo || wasChecked)) return null;
  const isUntouched = view.updatedAt === view.createdAt;
  const patch =
    known === null || hasLogo
      ? {}
      : {
          ...(isUntouched && payload.merchant !== known.name
            ? { merchant: known.name }
            : {}),
          ...(known.logo ? { merchantLogo: known.logo } : {}),
          ...(known.category && !payload.category
            ? { category: known.category }
            : {}),
        };
  const hasPatch = Object.keys(patch).length > 0;
  return { needsHome, patch: hasPatch ? patch : null };
}
