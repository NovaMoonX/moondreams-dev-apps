import type { MembershipProfile, Viewing } from '@apps/a-list/types';
import {
  getBillingCycleDates,
  getMembershipCost,
} from '@apps/a-list/utils/billing';

export interface SavingsSummary {
  monthlyTotalCents: number;
  cyclesElapsed: number;
  totalTicketSavingsCents: number;
  feesAvoidedCents: number;
  membershipCostCents: number;
  netSavingsCents: number;
  isBrokenEven: boolean;
  premiumFormatSavingsCents: number;
  /** Seen movies with no ticket yet. */
  unpricedCount: number;
  /** Seen premium tickets with no standard price, so they add nothing to premium savings. */
  premiumUnpricedCount: number;
}

/** Only seen movies with a ticket count: a planned one hasn't been used yet. */
export function getSavingsSummary(
  viewings: Viewing[],
  membership: MembershipProfile,
  todayDay: number,
): SavingsSummary {
  const seen = viewings.filter((viewing) => viewing.status === 'SEEN');
  const tickets = seen.flatMap((viewing) =>
    viewing.ticket ? [viewing.ticket] : [],
  );
  const premiumTickets = tickets.filter(
    (ticket) => ticket.format !== 'STANDARD',
  );
  const totalTicketSavingsCents = tickets.reduce(
    (total, ticket) => total + ticket.totalCents,
    0,
  );
  const membershipCostCents = getMembershipCost(membership, todayDay);
  const netSavingsCents = totalTicketSavingsCents - membershipCostCents;

  const result: SavingsSummary = {
    monthlyTotalCents: membership.monthlyTotalCents,
    cyclesElapsed: getBillingCycleDates(membership.startDate, todayDay).length,
    totalTicketSavingsCents,
    feesAvoidedCents: tickets.reduce(
      (total, ticket) => total + ticket.feeAvoidedCents,
      0,
    ),
    membershipCostCents,
    netSavingsCents,
    isBrokenEven: netSavingsCents >= 0,
    premiumFormatSavingsCents: premiumTickets.reduce(
      (total, ticket) =>
        ticket.standardPriceCents === null
          ? total
          : total + ticket.priceCents - ticket.standardPriceCents,
      0,
    ),
    unpricedCount: seen.length - tickets.length,
    premiumUnpricedCount: premiumTickets.filter(
      (ticket) => ticket.standardPriceCents === null,
    ).length,
  };
  return result;
}
