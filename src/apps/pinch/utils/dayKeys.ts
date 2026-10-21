import { MONTH_WINDOW_PADDING } from '@apps/pinch/constants';
import {
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';

export const DAY_MS = 86_400_000;

const monthTitleFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayTitleFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `"2026-10-13"` for a planned day's stored date (UTC midnight). */
export const getPlannedDayKey = (date: number) => toDateInputValue(date);

/** `"2026-10-13"` for one of the calendar's local-midnight cells. */
export const getCellDayKey = (cell: Date) =>
  toLocalDateInputValue(cell.getTime());

/** The stored date (UTC midnight) of a `"YYYY-MM-DD"` key. */
export const getDateOfDayKey = (dayKey: string) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

export const getMonthKey = (year: number, monthIndex: number) =>
  toDateInputValue(Date.UTC(year, monthIndex, 1)).slice(0, 7);

/** The month the viewer's local clock is in. */
export const getLocalMonthKey = (now = new Date()) =>
  getMonthKey(now.getFullYear(), now.getMonth());

export const shiftMonthKey = (monthKey: string, delta: number) => {
  const [year, month] = monthKey.split('-').map(Number);
  return getMonthKey(year, month - 1 + delta);
};

export const formatMonthTitle = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return monthTitleFormatter.format(Date.UTC(year, month - 1, 1));
};

export const formatDayTitle = (dayKey: string) =>
  dayTitleFormatter.format(getDateOfDayKey(dayKey));

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  timeZone: 'UTC',
});

/** "Tuesday". */
export const formatWeekday = (dayKey: string) =>
  weekdayFormatter.format(getDateOfDayKey(dayKey));

/** The `[start, end)` of stored dates the listener covers for a shown month. */
export const getMonthWindow = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return {
    start: Date.UTC(year, month - 1 - MONTH_WINDOW_PADDING, 1),
    end: Date.UTC(year, month + MONTH_WINDOW_PADDING, 1),
  };
};

/** The day key `days` after (or before, if negative) another. */
export const addDaysToKey = (dayKey: string, days: number) =>
  toDateInputValue(getDateOfDayKey(dayKey) + days * DAY_MS);

/** The Monday of the week that holds a day. */
export const getWeekStartKey = (dayKey: string) =>
  addDaysToKey(
    dayKey,
    -((new Date(getDateOfDayKey(dayKey)).getUTCDay() + 6) % 7),
  );
