import { MAX_OCCURRENCES } from '@apps/runway/constants';
import type { Ending, Schedule } from '@apps/runway/types';

import { DAY_MS, daysInUtcMonth } from './dates';

const steppedDates = (anchor: number, to: number, stepDays: number) => {
  const count =
    to < anchor ? 0 : Math.floor((to - anchor) / (stepDays * DAY_MS)) + 1;
  const result = Array.from(
    { length: Math.min(count, MAX_OCCURRENCES) },
    (_, index) => anchor + index * stepDays * DAY_MS,
  );
  return result;
};

const monthlyDates = (schedule: Schedule, anchor: number, to: number) => {
  const first = new Date(anchor);
  const last = new Date(to);
  const months =
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    last.getUTCMonth() -
    first.getUTCMonth() +
    1;
  const days = [...new Set(schedule.monthDays)].sort((a, b) => a - b);
  const result = Array.from(
    { length: Math.min(Math.max(months, 0), MAX_OCCURRENCES) },
    (_, index) => index,
  )
    .flatMap((index) => {
      const year = first.getUTCFullYear();
      const month = first.getUTCMonth() + index;
      const length = daysInUtcMonth(year, month);
      return days.map((day) => Date.UTC(year, month, Math.min(day, length)));
    })
    .filter((date) => date >= anchor && date <= to);
  return result;
};

const candidateDates = (schedule: Schedule, to: number) => {
  const anchor = schedule.anchor;
  if (anchor === null) return [];
  if (schedule.kind === 'once') return anchor <= to ? [anchor] : [];
  if (schedule.kind === 'weekly') return steppedDates(anchor, to, 7);
  if (schedule.kind === 'everyOtherWeek') return steppedDates(anchor, to, 14);
  if (schedule.kind === 'monthly' || schedule.kind === 'twiceMonthly') {
    return monthlyDates(schedule, anchor, to);
  }
  return [];
};

/**
 * The dates a schedule produces from `from` through `to` (both inclusive, UTC midnight), cut off by the
 * ending. A count ending counts from the first occurrence ever, not from `from`; an end date covers its
 * whole day. An irregular schedule has no dates.
 */
export function occurrences(
  schedule: Schedule,
  ending: Ending,
  from: number,
  to: number,
): number[] {
  const onDate = ending.onDate;
  const result = candidateDates(schedule, to)
    .filter((date) => onDate === null || date <= onDate)
    .slice(0, ending.afterCount ?? MAX_OCCURRENCES)
    .filter((date) => date >= from);
  return result;
}
