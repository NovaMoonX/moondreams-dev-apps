import { MAX_OCCURRENCES } from '@apps/runway/constants';
import type { Ending, FundingRule, Schedule } from '@apps/runway/types';

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
      const clamped = days.map((day) =>
        Date.UTC(year, month, Math.min(day, length)),
      );
      return [...new Set(clamped)];
    })
    .filter((date) => date >= anchor && date <= to);
  return result;
};

const MAX_CACHED_SCHEDULES = 512;
const candidateCache = new Map<string, readonly number[]>();

const generateCandidates = (schedule: Schedule, to: number) => {
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

/** A schedule's dates up to `to`, kept by what names them: a lookahead asks the same bills for the same dates once per income day. */
const candidateDates = (schedule: Schedule, to: number): readonly number[] => {
  const key = `${schedule.kind}|${schedule.anchor}|${String(schedule.monthDays)}|${to}`;
  const cached = candidateCache.get(key);
  if (cached) return cached;
  const result = generateCandidates(schedule, to);
  if (candidateCache.size >= MAX_CACHED_SCHEDULES) candidateCache.clear();
  candidateCache.set(key, result);
  return result;
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

/**
 * Of the plan-wide income days, the ones a funding cadence selects, counted in chronological order
 * whatever order they arrive in. Every Nth counts from the anchor day: the anchor and every Nth day
 * after it. An anchor that is no longer in the list (its day has passed) counts from the first day listed.
 */
export function selectFundedDays<D extends { dayKey: string; on: number }>(
  cadence: FundingRule['cadence'],
  days: readonly D[],
): D[] {
  const ordered = [...days].sort(
    (a, b) =>
      a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
  );
  if (cadence.kind === 'everyIncomeDay') return ordered;
  if (cadence.kind === 'chosen') {
    const chosen = new Set(cadence.dayKeys);
    return ordered.filter((day) => chosen.has(day.dayKey));
  }
  const found = ordered.findIndex((day) => day.dayKey === cadence.anchorDayKey);
  const anchorIndex = Math.max(found, 0);
  const result = ordered.filter(
    (_, index) =>
      index >= anchorIndex && (index - anchorIndex) % cadence.n === 0,
  );
  return result;
}
