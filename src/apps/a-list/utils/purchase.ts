import { AMC_FORMAT_LABELS } from '@apps/a-list/constants';
import type { PurchasePlan, ShowtimeOption, Viewing } from '@apps/a-list/types';
import {
  getInitialTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';
import { centsToInputValue, formatCents } from '@apps/a-list/utils/money';

export function toPurchasePlan(option: ShowtimeOption): PurchasePlan {
  return {
    showtimeId: option.showtimeId,
    format: option.format,
    priceCents: option.priceCents,
    standardPriceCents: option.standardPriceCents,
    purchaseUrl: option.purchaseUrl,
    startedAt: null,
  };
}

/** The ticket form's start for a picked showing: its format and AMC's prices; the fee and tax are still the member's to enter. */
export function applyPurchaseToDraft(
  draft: TicketDraft,
  plan: Pick<PurchasePlan, 'format' | 'priceCents' | 'standardPriceCents'>,
): TicketDraft {
  return {
    ...draft,
    format: plan.format,
    price: centsToInputValue(plan.priceCents),
    standardPrice:
      plan.format === 'STANDARD'
        ? ''
        : centsToInputValue(plan.standardPriceCents),
  };
}

export function getPurchaseTicketDraft(
  plan: PurchasePlan,
  defaultFeeCents: number,
): TicketDraft {
  return applyPurchaseToDraft(
    getInitialTicketDraft(null, defaultFeeCents),
    plan,
  );
}

/** "Dolby Cinema · $20.49", or just the format when AMC listed no price. */
export function describePurchase(
  plan: Pick<PurchasePlan, 'format' | 'priceCents'>,
): string {
  const result = [
    AMC_FORMAT_LABELS[plan.format],
    plan.priceCents === null ? null : formatCents(plan.priceCents),
  ]
    .filter(Boolean)
    .join(' · ');
  return result;
}

/** Tickets can be bought for a planned showing that has none yet and hasn't started. */
export function canBuyTickets(
  viewing: Pick<Viewing, 'status' | 'ticket' | 'showtimeAt'>,
  now: number,
): boolean {
  const result =
    viewing.status === 'PLANNED' &&
    (viewing.ticket ?? null) === null &&
    viewing.showtimeAt > now;
  return result;
}

/** The welcome-back question is for a showing the member left to buy that has no ticket yet and hasn't ended. */
export function shouldAskAboutPurchase(
  viewing: Pick<Viewing, 'status' | 'ticket' | 'purchase' | 'endsAt'>,
  now: number,
): boolean {
  const result =
    viewing.status === 'PLANNED' &&
    (viewing.ticket ?? null) === null &&
    viewing.purchase?.startedAt != null &&
    viewing.endsAt > now;
  return result;
}
