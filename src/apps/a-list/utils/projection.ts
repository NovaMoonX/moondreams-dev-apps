import {
  MIN_CONTRACT_MONTHS,
  MAX_MOVIES_PER_MONTH,
  MAX_MOVIES_PER_WEEK,
} from '@apps/a-list/constants';
import type { MembershipProfile, Viewing } from '@apps/a-list/types';
import {
  getBillingCycleDates,
  getCycleDate,
  getMonthlyTotalAt,
} from '@apps/a-list/utils/billing';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30.4375 * DAY_MS;
const HORIZON_CANDIDATES = [3, 6, 9, 12, 18, 24];

export interface ProjectionBase {
  /** Seen tickets' savings so far. */
  savedCents: number;
  /** Months billed so far. */
  cyclesBilled: number;
  /** Months still owed before the minimum is met; 0 once it is. */
  minimumMonthsLeft: number;
  monthlyTotalCents: number;
  /** The average a seen ticket saved (price, fee and tax); null before any ticket is on record. */
  averageTicketCents: number | null;
  /** The average convenience fee a seen ticket avoided. */
  averageFeeCents: number;
  /** Total billed months a pace can run to, soonest first. */
  horizons: number[];
}

export interface ProjectionResult {
  movies: number;
  /** What those movies add to the savings; null when a pace has no ticket value to use. */
  addedCents: number | null;
  /** Total membership cost through the projection. */
  costCents: number;
  /** Total months billed at the end of the projection. */
  months: number;
  /** Date-only: the last bill the projection pays. */
  lastBillDate: number;
  /** Savings so far plus `addedCents`, less `costCents`; null when `addedCents` is. */
  netCents: number | null;
  /** Planned showings counted without a price, which add nothing. */
  unpricedCount: number;
}

/** Month totals a pace can run to; past the longest, the next three half years. */
function getHorizons(cyclesBilled: number) {
  const ahead = HORIZON_CANDIDATES.filter((months) => months > cyclesBilled);
  const result =
    ahead.length > 0
      ? ahead.slice(0, 4)
      : [6, 12, 18].map((extra) => cyclesBilled + extra);
  return result;
}

export function getProjectionBase(
  viewings: Viewing[],
  membership: MembershipProfile,
  todayDay: number,
): ProjectionBase {
  const tickets = viewings.flatMap((viewing) =>
    viewing.status === 'SEEN' && viewing.ticket ? [viewing.ticket] : [],
  );
  const savedCents = tickets.reduce(
    (total, ticket) => total + ticket.totalCents,
    0,
  );
  const cyclesBilled = getBillingCycleDates(
    membership.startDate,
    todayDay,
  ).length;
  const result: ProjectionBase = {
    savedCents,
    cyclesBilled,
    minimumMonthsLeft: Math.max(0, MIN_CONTRACT_MONTHS - cyclesBilled),
    monthlyTotalCents: membership.monthlyTotalCents,
    averageTicketCents:
      tickets.length === 0 ? null : Math.round(savedCents / tickets.length),
    averageFeeCents:
      tickets.length === 0
        ? 0
        : Math.round(
            tickets.reduce(
              (total, ticket) => total + ticket.feeAvoidedCents,
              0,
            ) / tickets.length,
          ),
    horizons: getHorizons(cyclesBilled),
  };
  return result;
}

/** What a membership costs when it is billed for `months` in all. */
function getCostForMonths(membership: MembershipProfile, months: number) {
  const result = Array.from({ length: months }, (_, offset) =>
    getMonthlyTotalAt(membership, getCycleDate(membership.startDate, offset)),
  ).reduce((total, cents) => total + cents, 0);
  return result;
}

function finish(
  base: ProjectionBase,
  membership: MembershipProfile,
  movies: number,
  addedCents: number | null,
  months: number,
  unpricedCount: number,
): ProjectionResult {
  const costCents = getCostForMonths(membership, months);
  const result: ProjectionResult = {
    movies,
    addedCents,
    costCents,
    months,
    lastBillDate: getCycleDate(membership.startDate, months - 1),
    netCents:
      addedCents === null ? null : base.savedCents + addedCents - costCents,
    unpricedCount,
  };
  return result;
}

/** Stopping now still pays out the minimum: the bills already due and the ones before it is met. */
export function projectStop(
  base: ProjectionBase,
  membership: MembershipProfile,
): ProjectionResult {
  const months = Math.max(base.cyclesBilled, MIN_CONTRACT_MONTHS);
  const result = finish(base, membership, 0, 0, months, 0);
  return result;
}

/** What one planned showing is likely to save: AMC's price with tax and the avoided fee, else the member's average. */
function estimatePlannedCents(
  viewing: Viewing,
  membership: MembershipProfile,
  base: ProjectionBase,
): number | null {
  const price = viewing.purchase?.priceCents ?? null;
  if (price === null) return base.averageTicketCents;

  const tax = Math.round(price * (membership.taxRate ?? 0));
  const result = price + tax + base.averageFeeCents;
  return result;
}

/** Showings still ahead on the calendar all get watched, and the membership is paid up to the last one. */
export function projectCalendar(
  base: ProjectionBase,
  membership: MembershipProfile,
  viewings: Viewing[],
  now: number,
): ProjectionResult {
  const ahead = viewings.filter(
    (viewing) => viewing.status === 'PLANNED' && viewing.showtimeAt > now,
  );
  const estimates = ahead.map((viewing) =>
    estimatePlannedCents(viewing, membership, base),
  );
  const lastShowing = ahead.reduce(
    (latest, viewing) => Math.max(latest, viewing.showtimeAt),
    0,
  );
  const lastDay = Math.floor(lastShowing / DAY_MS) * DAY_MS;
  const months = Math.max(
    base.cyclesBilled,
    MIN_CONTRACT_MONTHS,
    lastShowing === 0
      ? 0
      : getBillingCycleDates(membership.startDate, lastDay).length,
  );
  const result = finish(
    base,
    membership,
    ahead.length,
    estimates.reduce<number>((total, cents) => total + (cents ?? 0), 0),
    months,
    estimates.filter((cents) => cents === null).length,
  );
  return result;
}

export type PaceUnit = 'week' | 'month';

export function getPaceMax(unit: PaceUnit) {
  const result = unit === 'week' ? MAX_MOVIES_PER_WEEK : MAX_MOVIES_PER_MONTH;
  return result;
}

/** A steady pace from today until the bill after the last one paid, at `ticketCents` a movie. */
export function projectPace(
  base: ProjectionBase,
  membership: MembershipProfile,
  todayDay: number,
  pace: { unit: PaceUnit; count: number },
  months: number,
  ticketCents: number | null,
): ProjectionResult {
  const windowMs = Math.max(
    0,
    getCycleDate(membership.startDate, months) - todayDay,
  );
  const periods = windowMs / (pace.unit === 'week' ? WEEK_MS : MONTH_MS);
  const movies = Math.floor(pace.count * periods);
  const result = finish(
    base,
    membership,
    movies,
    ticketCents === null ? null : movies * ticketCents,
    Math.max(months, MIN_CONTRACT_MONTHS),
    0,
  );
  return result;
}

/** Movies at `ticketCents` each that bring the projection to break even; null with no ticket value. */
export function getMoviesToBreakEven(
  base: ProjectionBase,
  costCents: number,
  ticketCents: number | null,
): number | null {
  if (ticketCents === null || ticketCents <= 0) return null;

  const result = Math.max(
    0,
    Math.ceil((costCents - base.savedCents) / ticketCents),
  );
  return result;
}
