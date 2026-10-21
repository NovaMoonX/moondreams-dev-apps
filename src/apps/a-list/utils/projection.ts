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
  /** Each seen ticket's local day and what it saved, so the line can start in the past. */
  ticketHistory: { day: number; cents: number }[];
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

/** Month totals a pace can run to: the earliest cancel date (where stopping now ends), then later ones. */
function getHorizons(cyclesBilled: number) {
  const first = Math.max(cyclesBilled, MIN_CONTRACT_MONTHS);
  const result = [first, first + 3, first + 9];
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
  const ticketHistory = viewings.flatMap((viewing) =>
    viewing.status === 'SEEN' && viewing.ticket
      ? [
          {
            day: fromDateInputValue(getDayKey(viewing.showtimeAt)) ?? 0,
            cents: viewing.ticket.totalCents,
          },
        ]
      : [],
  );
  const result: ProjectionBase = {
    ticketHistory,
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

export interface CalendarPlan {
  /** `day` is the showing's local day as UTC midnight, comparable with the plan's other days. */
  ahead: { day: number; cents: number | null }[];
  /** Planned showings already over that nobody has marked seen. */
  unmarkedCount: number;
}

/** The showings still ahead and what each is likely to save. */
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
      day: fromDateInputValue(getDayKey(viewing.showtimeAt)) ?? 0,
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
  const lastDay = plan.ahead.reduce(
    (latest, showing) => Math.max(latest, showing.day),
    0,
  );
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

/** The local day the last planned showing falls on, or today when nothing is planned. */
export function getPlanEndDay(plan: CalendarPlan, todayDay: number) {
  const result = plan.ahead.reduce(
    (latest, showing) => Math.max(latest, showing.day),
    todayDay,
  );
  return result;
}

/** Everything planned is watched, then a steady pace runs from the last planned day to the cancel date. */
export function projectPlannedThenPace(
  base: ProjectionBase,
  membership: MembershipProfile,
  todayDay: number,
  plan: CalendarPlan,
  pace: { unit: PaceUnit; count: number },
  months: number,
  ticketCents: number | null,
): ProjectionResult {
  const planned = projectCalendar(base, membership, plan);
  const allMonths = Math.max(months, planned.months);
  const windowMs = Math.max(
    0,
    getCycleDate(membership.startDate, allMonths) -
      getPlanEndDay(plan, todayDay),
  );
  const periods = windowMs / (pace.unit === 'week' ? WEEK_MS : MONTH_MS);
  const movies = Math.floor(pace.count * periods);
  const result = finish(base, membership, {
    movies: planned.movies + movies,
    addedCents:
      ticketCents === null
        ? null
        : (planned.addedCents ?? 0) + movies * ticketCents,
    months: Math.max(allMonths, base.cyclesBilled),
    unpricedCount: planned.unpricedCount,
    unmarkedCount: planned.unmarkedCount,
    periods,
  });
  return result;
}

/** What the planned showings and then a steady pace have added by a day. */
export const getPlannedThenPaceAddedBy =
  (
    plan: CalendarPlan,
    todayDay: number,
    pace: { unit: PaceUnit; count: number },
    ticketCents: number | null,
  ): AddedBy =>
  (day) =>
    getCalendarAddedBy(plan)(day) +
    getPaceAddedBy(getPlanEndDay(plan, todayDay), pace, ticketCents)(day);

/** The movies, and the steady pace over the projection's window, that bring it to break even; null with no ticket value. */
export function getBreakEven(
  base: ProjectionBase,
  projection: ProjectionResult,
  ticketCents: number | null,
  alreadyCents = 0,
): { movies: number; perPeriod: number | null } | null {
  if (ticketCents === null || ticketCents <= 0) return null;

  const movies = Math.max(
    0,
    Math.ceil(
      (projection.costCents - base.savedCents - alreadyCents) / ticketCents,
    ),
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
  /** The comparison line (what happens with less or nothing more watched); null before today. */
  y2: number | null;
}

/** What a plan has added by a given day, in cents. */
export type AddedBy = (day: number) => number;

/** What the planned showings add by a day, each counted on its local day. */
export const getCalendarAddedBy =
  (plan: CalendarPlan): AddedBy =>
  (day) =>
    plan.ahead.reduce(
      (total, showing) =>
        showing.day <= day ? total + (showing.cents ?? 0) : total,
      0,
    );

/** What a steady pace adds by a day. */
export const getPaceAddedBy =
  (
    todayDay: number,
    pace: { unit: PaceUnit; count: number },
    ticketCents: number | null,
  ): AddedBy =>
  (day) =>
    Math.max(
      0,
      Math.floor(
        (pace.count * (day - todayDay)) /
          (pace.unit === 'week' ? WEEK_MS : MONTH_MS),
      ),
    ) * (ticketCents ?? 0);

/** Net savings by week and on each bill, from `fromDay` (in the past, to show history) to the day the paid months run to. */
export function getNetSeries(
  base: ProjectionBase,
  membership: MembershipProfile,
  todayDay: number,
  projection: ProjectionResult,
  addedBy: AddedBy,
  fromDay: number = todayDay,
  baselineAddedBy: AddedBy = () => 0,
  baselineFromDay: number = todayDay,
): NetPoint[] {
  const endDay = projection.coveredUntil;
  const billCosts = Array.from({ length: projection.months + 1 }, (_, count) =>
    Array.from({ length: count }, (_, offset) =>
      getMonthlyTotalAt(membership, getCycleDate(membership.startDate, offset)),
    ).reduce((total, cents) => total + cents, 0),
  );
  const billDays = Array.from({ length: projection.months }, (_, offset) =>
    getCycleDate(membership.startDate, offset),
  ).filter((day) => day > fromDay && day < endDay);
  const weekDays = Array.from(
    { length: Math.max(0, Math.ceil((endDay - fromDay) / WEEK_MS)) },
    (_, week) => fromDay + week * WEEK_MS,
  ).filter((day) => day < endDay);
  const days = [
    ...new Set([...weekDays, ...billDays, todayDay, baselineFromDay, endDay]),
  ]
    .filter((day) => day >= fromDay)
    .sort((left, right) => left - right);
  const result = days.map((day) => {
    const isPast = day < todayDay;
    const billed = Math.min(
      projection.months,
      getBillingCycleDates(membership.startDate, day).length,
    );
    const cost = billCosts[day >= endDay ? projection.months : billed];
    const saved = isPast
      ? base.ticketHistory.reduce(
          (total, ticket) => (ticket.day <= day ? total + ticket.cents : total),
          0,
        )
      : base.savedCents;
    return {
      x: day,
      y: saved + (isPast ? 0 : addedBy(day)) - cost,
      y2:
        day < baselineFromDay
          ? null
          : base.savedCents + baselineAddedBy(day) - cost,
    };
  });
  return result;
}

/** Where the series last rises through $0 and stays there, interpolated between its points; null when it starts at or above $0 or ends below it. */
export function getBreakEvenPoint(series: NetPoint[]): { x: number } | null {
  if (series.length === 0 || series[0].y >= 0) return null;

  const lastBelow = series.reduce(
    (last, point, index) => (point.y < 0 ? index : last),
    -1,
  );
  if (lastBelow === series.length - 1) return null;

  const before = series[lastBelow];
  const after = series[lastBelow + 1];
  const share = (0 - before.y) / (after.y - before.y);
  const result = { x: Math.round(before.x + share * (after.x - before.x)) };
  return result;
}
