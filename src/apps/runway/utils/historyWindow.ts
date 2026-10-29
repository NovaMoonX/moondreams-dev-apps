import { DAY_MS } from '@apps/runway/engine/dates';
import {
  getMonthStart,
  getNextMonth,
  listMonths,
  toMonthKey,
} from '@apps/runway/engine/closings';
import type { SpendRange } from '@apps/runway/utils/spendPeriod';
import type { DateOnly } from '@apps/runway/types';

/** The days of one month the recent window does not already hold: the month, cut off where the recent window begins. */
export function getHistoryRange(
  month: string,
  recentFrom: DateOnly,
): SpendRange {
  const from = getMonthStart(month);
  const to = Math.min(getMonthStart(getNextMonth(month)), recentFrom);
  return { from, to, key: `${from}:${to}` };
}

/** Every month from the plan's start through the last one that starts before the recent window, newest first. */
export function listHistoryMonths(
  startDate: DateOnly | null,
  recentFrom: DateOnly,
): string[] {
  if (startDate === null) return [];
  return listMonths(
    toMonthKey(startDate),
    toMonthKey(recentFrom - DAY_MS),
  ).reverse();
}
