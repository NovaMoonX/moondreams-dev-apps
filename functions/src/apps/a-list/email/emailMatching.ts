import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { normalizeTitle } from '../amc.js';
import type { LocalShowtime } from './parseAmcEmail.js';
import type { Ticket, Viewing } from './emailTypes.js';

const MINUTE_MS = 60_000;
export const ATTACH_WINDOW_MS = 45 * MINUTE_MS;
export const CANCEL_WINDOW_MS = 5 * MINUTE_MS;
const SHOWTIME_MATCH_MS = MINUTE_MS;
// Kept equal to the app's previews allowance and default runtime.
const PREVIEWS_BUFFER_MINUTES = 20;
const DEFAULT_RUNTIME_MINUTES = 120;

export { normalizeTitle };

/** "AMC Park Place 16" and "Park Place 16" are one theater: the brand word and punctuation never tell two apart. */
export const normalizeTheatreName = (value: string | undefined) =>
  (value ?? '')
    .toLowerCase()
    .replace(/\bamc\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const computeEndsAt = (
  showtimeAt: number,
  runtimeMinutes: number | null,
) =>
  showtimeAt +
  (PREVIEWS_BUFFER_MINUTES + (runtimeMinutes ?? DEFAULT_RUNTIME_MINUTES)) *
    MINUTE_MS;

const pad = (value: number) => String(value).padStart(2, '0');

/** The instant a wall-clock showtime occurs in a theater's zone. */
export const localShowtimeToEpoch = (local: LocalShowtime, timeZone: string) =>
  zonedDateTimeToEpoch(
    `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    `${pad(local.hour)}:${pad(local.minute)}`,
    timeZone,
  );

export const localDayOf = (local: LocalShowtime) =>
  `${local.year}-${pad(local.month)}-${pad(local.day)}`;

type MatchableViewing = Pick<
  Viewing,
  'id' | 'movieKey' | 'showtimeAt' | 'status' | 'ticket' | 'theatre'
> & { movie: { title: string }; amcConfirmation: string | null };

const isSameTheatre = (
  viewing: Pick<Viewing, 'theatre'>,
  theatre: { theatreId: string; name: string },
) =>
  viewing.theatre !== null &&
  (viewing.theatre.theatreId === theatre.theatreId ||
    normalizeTheatreName(viewing.theatre.name) ===
      normalizeTheatreName(theatre.name));

const nearest = <T extends { showtimeAt: number }>(
  candidates: T[],
  showtimeAt: number,
) =>
  [...candidates].sort(
    (left, right) =>
      Math.abs(left.showtimeAt - showtimeAt) -
      Math.abs(right.showtimeAt - showtimeAt),
  )[0] ?? null;

/** A planned showing with no ticket yet that this reservation is for: the same movie (key or exact title) at the same theater (a showing with no theater set also fits) within 45 minutes. */
export function findAttachTarget<T extends MatchableViewing>(
  viewings: T[],
  reservation: {
    movieKey: string;
    title: string;
    theatre: { theatreId: string; name: string };
    showtimeAt: number;
  },
): T | null {
  const title = normalizeTitle(reservation.title);
  return nearest(
    viewings.filter(
      (viewing) =>
        viewing.status === 'PLANNED' &&
        viewing.ticket === null &&
        (viewing.movieKey === reservation.movieKey ||
          normalizeTitle(viewing.movie.title) === title) &&
        (viewing.theatre === null ||
          isSameTheatre(viewing, reservation.theatre)) &&
        Math.abs(viewing.showtimeAt - reservation.showtimeAt) <=
          ATTACH_WINDOW_MS,
    ),
    reservation.showtimeAt,
  );
}

/** The planned showing a cancellation is for: the one that holds its confirmation number, else one with a ticket and no other confirmation, the same exact title and theater name within five minutes. A seen showing is never removed. */
export function findCancelTarget<T extends MatchableViewing>(
  viewings: T[],
  cancellation: {
    confirmation: string;
    title: string;
    theatreName: string;
    showtimeAt: number;
  },
): T | null {
  const planned = viewings.filter((viewing) => viewing.status === 'PLANNED');
  const byConfirmation = planned.find(
    (viewing) => viewing.amcConfirmation === cancellation.confirmation,
  );
  if (byConfirmation !== undefined) return byConfirmation;
  const title = normalizeTitle(cancellation.title);
  const theatre = normalizeTheatreName(cancellation.theatreName);
  return nearest(
    planned.filter(
      (viewing) =>
        viewing.ticket !== null &&
        (viewing.amcConfirmation === null ||
          viewing.amcConfirmation === cancellation.confirmation) &&
        normalizeTitle(viewing.movie.title) === title &&
        viewing.theatre !== null &&
        normalizeTheatreName(viewing.theatre.name) === theatre &&
        Math.abs(viewing.showtimeAt - cancellation.showtimeAt) <=
          CANCEL_WINDOW_MS,
    ),
    cancellation.showtimeAt,
  );
}

interface AmountInput {
  /** One ticket's price as the email lists it; null when it lists none. */
  emailPriceCents: number | null;
  /** AMC's list price and tax for the showing; null when AMC was not asked or has no such showing. */
  amc: { priceCents: number | null; taxCents: number | null } | null;
  /** The member's usual tax rate at this theater; null when they have no ticket there yet. */
  usualTaxRate: number | null;
}

const isClose = (left: number, right: number) => Math.abs(left - right) <= 1;

/** The price and tax to record: AMC's own figures when the email's price matches them (the email's price may already include tax), else the email's price with the member's usual rate. null when no price is known. */
export function reconcileAmounts({
  emailPriceCents,
  amc,
  usualTaxRate,
}: AmountInput): { priceCents: number; taxCents: number } | null {
  const usual = (priceCents: number) =>
    usualTaxRate === null ? 0 : Math.round(priceCents * usualTaxRate);
  const listed = amc?.priceCents ?? null;
  if (emailPriceCents === null) {
    return listed === null
      ? null
      : { priceCents: listed, taxCents: amc?.taxCents ?? usual(listed) };
  }
  if (listed !== null && isClose(emailPriceCents, listed)) {
    return { priceCents: listed, taxCents: amc?.taxCents ?? usual(listed) };
  }
  if (
    listed !== null &&
    amc?.taxCents != null &&
    isClose(emailPriceCents, listed + amc.taxCents)
  ) {
    return { priceCents: listed, taxCents: amc.taxCents };
  }
  return { priceCents: emailPriceCents, taxCents: usual(emailPriceCents) };
}

/** The most-used rate among tickets, a tie going to the most recent one; null when none has a rate. */
const mostUsedRate = (
  viewings: Pick<Viewing, 'showtimeAt' | 'ticket'>[],
): number | null => {
  const taxed = viewings
    .filter((viewing) => typeof viewing.ticket?.taxRate === 'number')
    .sort((left, right) => right.showtimeAt - left.showtimeAt);
  const counts = taxed.reduce(
    (tally, viewing) =>
      tally.set(
        viewing.ticket?.taxRate as number,
        (tally.get(viewing.ticket?.taxRate as number) ?? 0) + 1,
      ),
    new Map<number, number>(),
  );
  const most = Math.max(0, ...counts.values());
  return (
    taxed.find(
      (viewing) => counts.get(viewing.ticket?.taxRate as number) === most,
    )?.ticket?.taxRate ?? null
  );
};

/** The usual tax rate at a theater: the rate most used there, else the rate most used anywhere; a tie goes to the most recent ticket. */
export function findUsualTaxRate(
  viewings: Pick<Viewing, 'showtimeAt' | 'ticket' | 'theatre'>[],
  theatre: { theatreId: string; name: string },
): number | null {
  return (
    mostUsedRate(
      viewings.filter((viewing) => isSameTheatre(viewing, theatre)),
    ) ?? mostUsedRate(viewings)
  );
}

/** The tickets an order still holds after a refund that covers only part of them; null when the refund is the whole order, or the count is unknown (a showing typed in, or older: the cancellation then takes the whole reservation). */
export const ticketsLeftAfterRefund = (
  heldCount: number | null,
  refundedCount: number | null,
) =>
  heldCount !== null &&
  refundedCount !== null &&
  refundedCount > 0 &&
  heldCount > refundedCount
    ? heldCount - refundedCount
    : null;

/** The key a refund email is counted under once: AMC's order number, else the confirmation with the count and the refund date when printed; a repeat is never counted twice, at the cost of two unnumbered same-size refunds counting once. */
export const refundKey = (refund: {
  orderNumber: string | null;
  confirmation: string;
  refundedCount: number | null;
  refundDate: string | null;
}) =>
  refund.orderNumber ??
  [refund.confirmation, refund.refundedCount ?? 'all', refund.refundDate ?? '']
    .filter((part) => part !== '')
    .join('-');

/** An itemized ticket whose parts add up to its total; null when nothing prices it. */
export function buildTicket({
  amounts,
  format,
  standardPriceCents,
  feeAvoidedCents,
}: {
  amounts: { priceCents: number; taxCents: number } | null;
  format: Ticket['format'];
  standardPriceCents: number | null;
  feeAvoidedCents: number;
}): Ticket | null {
  if (amounts === null) return null;
  const { priceCents, taxCents } = amounts;
  return {
    entryMode: 'ITEMIZED',
    format,
    priceCents,
    standardPriceCents: format === 'STANDARD' ? null : standardPriceCents,
    feeAvoidedCents,
    taxRate:
      priceCents > 0
        ? Math.round((taxCents / priceCents) * 10_000) / 10_000
        : null,
    taxCents,
    taxChoice: null,
    totalCents: priceCents + feeAvoidedCents + taxCents,
  };
}

/** The showing AMC lists at this start time (within a minute), if any. */
export const findListedShowtime = <T extends { startsAt: number }>(
  showtimes: T[],
  startsAt: number,
) =>
  showtimes.find(
    (showtime) => Math.abs(showtime.startsAt - startsAt) <= SHOWTIME_MATCH_MS,
  ) ?? null;
