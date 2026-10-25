import { DEFAULT_TICKET_PRICE_KIND } from '@apps/a-list/constants';
import type {
  MembershipProfile,
  ShowtimeOption,
  TicketPriceKind,
} from '@apps/a-list/types';

export function getTicketPriceKind(
  membership: Pick<MembershipProfile, 'ticketPriceKind'> | null,
): TicketPriceKind {
  return membership?.ticketPriceKind ?? DEFAULT_TICKET_PRICE_KIND;
}

/** The showing priced as the chosen kind of ticket; a kind AMC lists no price for reads as unpriced, never as another kind's price. */
export function applyTicketPriceKind(
  option: ShowtimeOption,
  kind: TicketPriceKind,
): ShowtimeOption {
  return {
    ...option,
    priceCents: option.prices?.[kind] ?? (option.prices ? null : option.priceCents),
    standardPriceCents:
      option.standardPrices?.[kind] ??
      (option.standardPrices ? null : option.standardPriceCents),
  };
}
