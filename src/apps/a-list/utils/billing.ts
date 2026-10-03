import type { MembershipProfile } from '@apps/a-list/types';

function getDaysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Every billing date from the start date through `todayDay` (both date-only, UTC midnight). Each is
 * computed from the start date, clamped to the month's last day, so a 31st bills Feb 28 and then
 * Mar 31 again instead of drifting.
 */
export function getBillingCycleDates(
  startDate: number,
  todayDay: number,
): number[] {
  const start = new Date(startDate);
  const today = new Date(todayDay);
  const monthSpan =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth());
  const result = Array.from(
    { length: Math.max(0, monthSpan + 1) },
    (_, offset) => {
      const year =
        start.getUTCFullYear() +
        Math.floor((start.getUTCMonth() + offset) / 12);
      const monthIndex = (start.getUTCMonth() + offset) % 12;
      const day = Math.min(
        start.getUTCDate(),
        getDaysInUtcMonth(year, monthIndex),
      );
      return Date.UTC(year, monthIndex, day);
    },
  ).filter((cycleDate) => cycleDate <= todayDay);
  return result;
}

/** The monthly total in effect on a billing date; one total for now, a price history later. */
export function getMonthlyTotalAt(
  membership: MembershipProfile,
  cycleDate: number,
): number {
  void cycleDate;
  return membership.monthlyTotalCents;
}

export function getMembershipCost(
  membership: MembershipProfile,
  todayDay: number,
): number {
  const result = getBillingCycleDates(membership.startDate, todayDay).reduce(
    (total, cycleDate) => total + getMonthlyTotalAt(membership, cycleDate),
    0,
  );
  return result;
}
