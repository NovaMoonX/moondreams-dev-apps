import {
  MAX_MOVIES_PER_MONTH,
  MAX_MOVIES_PER_WEEK,
  MIN_CONTRACT_MONTHS,
} from '@apps/a-list/constants';
import type { MembershipProfile, Viewing } from '@apps/a-list/types';
import {
  getBillingCycleDates,
  getCycleDate,
  getMembershipCost,
  getMonthlyTotalAt,
} from '@apps/a-list/utils/billing';
import { getDayKey } from '@apps/a-list/utils/dayKeys';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { parseMoneyToCents } from '@/utils/moneyUtils';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// Mean month length, so a monthly pace doesn't depend on which months the window crosses.
const MONTH_MS = 30.4375 * DAY_MS;
const HORIZON_CANDIDATES = [3, 6, 9, 12, 18, 24];
const HORIZON_COUNT = 3;
/** A typed ticket value above this is a slip, not a plan. */
const MAX_TICKET_CENTS = 100_000;

export interface ProjectionBase {
  savedCents: number;
  cyclesBilled: number;
  /** Months still owed before the minimum is met; 0 once it is. */
  minimumMonthsLeft: number;
  monthlyTotalCents: number;
  /** Net savings today, from the same cost the dashboard uses. */
  netNowCents: number;
  /** Average of seen tickets (price, fee and tax); null before any is on record. */
  averageTicketCents: number | null;
  averageFeeCents: number;
  /** Total months billed that a pace can run to. */
  horizons: number[];
}

export interface ProjectionResult {
  movies: number;
  /** Null when a pace has no ticket value to use. */
  addedCents: number | null;
  costCents: number;
  /** Bills paid in all. */
  months: number;
  /** Date-only: the next bill after the last one paid, so the day the paid months run to. */
  coveredUntil: number;
  netCents: number | null;
  /** Planned showings with no price and no average to fall back on, counted as $0. */
  unpricedCount: number;
  /** Planned showings already over that aren't marked seen, so they count for nothing. */
  unmarkedCount: number;
  /** Weeks or months a pace runs for; 0 for the other plans. */
  periods: number;
}

/** Month totals a pace can run to, always three. */
function getHorizons(cyclesBilled: number) {
  const ahead = HORIZON_CANDIDATES.filter((months) => months > cyclesBilled);
  const last = ahead.at(-1) ?? cyclesBilled;
  const result = [
    ...ahead,
    ...Array.from(
      { length: HORIZON_COUNT },
      (_, index) => last + 6 * (index + 1),
    ),
  ].slice(0, HORIZON_COUNT);
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
    netNowCents: savedCents - getMembershipCost(membership, todayDay),
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

/** A typed ticket value in cents; null when blank, not an amount, or implausibly large. */
export function parseTicketCents(input: string): number | null {
  const cents = parseMoneyToCents(input);
  const result = cents === null || cents > MAX_TICKET_CENTS ? null : cents;
  return result;
}

function finish(
  base: ProjectionBase,
  membership: MembershipProfile,
  plan: {
    movies: number;
    addedCents: number | null;
    months: number;
    unpricedCount?: number;
    unmarkedCount?: number;
    periods?: number;
  },
): ProjectionResult {
  const months = Math.max(plan.months, MIN_CONTRACT_MONTHS);
  const costCents = Array.from({ length: months }, (_, offset) =>
    getMonthlyTotalAt(membership, getCycleDate(membership.startDate, offset)),
  ).reduce((total, cents) => total + cents, 0);
  const result: ProjectionResult = {
    movies: plan.movies,
    addedCents: plan.addedCents,
    costCents,
    months,
    coveredUntil: getCycleDate(membership.startDate, months),
    netCents:
      plan.addedCents === null
        ? null
        : base.savedCents + plan.addedCents - costCents,
    unpricedCount: plan.unpricedCount ?? 0,
    unmarkedCount: plan.unmarkedCount ?? 0,
    periods: plan.periods ?? 0,
  };
  return result;
}

/** Stopping now still pays the bills already due and any left before the minimum is met. */
export function projectStop(
  base: ProjectionBase,
  membership: MembershipProfile,
): ProjectionResult {
  const result = finish(base, membership, {
    movies: 0,
    addedCents: 0,
    months: base.cyclesBilled,
  });
  return result;
}

/** AMC's price with tax and the average avoided fee, else the member's average. */
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

interface CalendarPlan {
  ahead: { at: number; cents: number | null }[];
  /** Planned showings already over that nobody has marked seen. */
  unmarkedCount: number;
}

export function getCalendarPlan(
  base: ProjectionBase,
  membership: MembershipProfile,
  viewings: Viewing[],
  now: number,
): CalendarPlan {
  const planned = viewings.filter((viewing) => viewing.status === 'PLANNED');
  const ahead = planned.filter((viewing) => viewing.showtimeAt > now);
  const result: CalendarPlan = {
    ahead: ahead.map((viewing) => ({
      at: viewing.showtimeAt,
      cents: estimatePlannedCents(viewing, membership, base),
    })),
    unmarkedCount: planned.length - ahead.length,
  };
  return result;
}

/** Every showing still ahead is watched, and the membership is paid up to the bill covering the last one. */
export function projectCalendar(
  base: ProjectionBase,
  membership: MembershipProfile,
  plan: CalendarPlan,
): ProjectionResult {
  const lastShowing = plan.ahead.reduce(
    (latest, showing) => Math.max(latest, showing.at),
    0,
  );
  // The viewer's local day, like every other day the screen compares against.
  const lastDay =
    lastShowing === 0 ? 0 : (fromDateInputValue(getDayKey(lastShowing)) ?? 0);
  const result = finish(base, membership, {
    movies: plan.ahead.length,
    addedCents: plan.ahead.reduce(
      (total, showing) => total + (showing.cents ?? 0),
      0,
    ),
    months: Math.max(
      base.cyclesBilled,
      lastDay === 0
        ? 0
        : getBillingCycleDates(membership.startDate, lastDay).length,
    ),
    unpricedCount: plan.ahead.filter((showing) => showing.cents === null)
      .length,
    unmarkedCount: plan.unmarkedCount,
  });
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
  const result = finish(base, membership, {
    movies,
    addedCents: ticketCents === null ? null : movies * ticketCents,
    months: Math.max(months, base.cyclesBilled),
    periods,
  });
  return result;
}

/** The movies, and the steady pace over the projection's window, that bring it to break even; null with no ticket value. */
export function getBreakEven(
  base: ProjectionBase,
  projection: ProjectionResult,
  ticketCents: number | null,
): { movies: number; perPeriod: number | null } | null {
  if (ticketCents === null || ticketCents <= 0) return null;

  const movies = Math.max(
    0,
    Math.ceil((projection.costCents - base.savedCents) / ticketCents),
  );
  const result = {
    movies,
    perPeriod:
      projection.periods > 0 ? Math.ceil(movies / projection.periods) : null,
  };
  return result;
}

export interface NetPoint {
  x: number;
  /** Net savings in cents on this day under the plan. */
  y: number;
  /** The same day if nothing more is watched. */
  y2: number;
}

/** What a plan has added by a given day, in cents. */
export type AddedBy = (day: number) => number;

export const getCalendarAddedBy =
  (plan: CalendarPlan): AddedBy =>
  (day) =>
    plan.ahead.reduce(
      (total, showing) =>
        showing.at < day + DAY_MS ? total + (showing.cents ?? 0) : total,
      0,
    );

export const getPaceAddedBy =
  (
    todayDay: number,
    pace: { unit: PaceUnit; count: number },
    ticketCents: number | null,
  ): AddedBy =>
  (day) =>
    Math.floor(
      (pace.count * (day - todayDay)) /
        (pace.unit === 'week' ? WEEK_MS : MONTH_MS),
    ) * (ticketCents ?? 0);

/** Net savings by week and on each bill, from today to the day the paid months run to. */
export function getNetSeries(
  base: ProjectionBase,
  membership: MembershipProfile,
  todayDay: number,
  projection: ProjectionResult,
  addedBy: AddedBy,
): NetPoint[] {
  const endDay = projection.coveredUntil;
  const billCosts = Array.from({ length: projection.months + 1 }, (_, count) =>
    Array.from({ length: count }, (_, offset) =>
      getMonthlyTotalAt(membership, getCycleDate(membership.startDate, offset)),
    ).reduce((total, cents) => total + cents, 0),
  );
  const billDays = Array.from({ length: projection.months }, (_, offset) =>
    getCycleDate(membership.startDate, offset),
  ).filter((day) => day > todayDay && day < endDay);
  const weekDays = Array.from(
    { length: Math.max(0, Math.ceil((endDay - todayDay) / WEEK_MS)) },
    (_, week) => todayDay + week * WEEK_MS,
  ).filter((day) => day < endDay);
  const days = [...new Set([...weekDays, ...billDays, endDay])].sort(
    (left, right) => left - right,
  );
  const result = days.map((day) => {
    const billed = Math.min(
      projection.months,
      getBillingCycleDates(membership.startDate, day).length,
    );
    const cost = billCosts[day >= endDay ? projection.months : billed];
    return {
      x: day,
      y: base.savedCents + addedBy(day) - cost,
      y2: base.savedCents - cost,
    };
  });
  return result;
}
