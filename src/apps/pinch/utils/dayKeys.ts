import { MONTH_WINDOW_PADDING, type CalendarView } from '@apps/pinch/constants';
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

/** The stored date (UTC midnight) of the viewer's local today: a planned day before it has passed. */
export const getLocalTodayDate = (now = Date.now()) =>
  getDateOfDayKey(toLocalDateInputValue(now));

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

/** The Sunday that starts the week holding a day, the grid's first column. */
export const getWeekStartKey = (dayKey: string) =>
  addDaysToKey(dayKey, -new Date(getDateOfDayKey(dayKey)).getUTCDay());

export interface DayRange {
  startKey: string;
  endKey: string;
}

/** The days a view shows for its anchor day, both ends included. */
export function getPeriodRange(
  view: CalendarView,
  anchorKey: string,
): DayRange {
  if (view === 'day') return { startKey: anchorKey, endKey: anchorKey };
  if (view === 'week') {
    const startKey = getWeekStartKey(anchorKey);
    return { startKey, endKey: addDaysToKey(startKey, 6) };
  }
  const monthKey = anchorKey.slice(0, 7);
  return {
    startKey: `${monthKey}-01`,
    endKey: addDaysToKey(`${shiftMonthKey(monthKey, 1)}-01`, -1),
  };
}

/** Every day a view paints, which for a month includes the leading and trailing days of its first and last week. */
export function getVisibleRange(
  view: CalendarView,
  anchorKey: string,
): DayRange {
  const { startKey, endKey } = getPeriodRange(view, anchorKey);
  if (view !== 'month') return { startKey, endKey };
  return {
    startKey: getWeekStartKey(startKey),
    endKey: addDaysToKey(getWeekStartKey(endKey), 6),
  };
}

/** The anchor day one step away: a month, a week or a day. */
export function shiftAnchor(
  view: CalendarView,
  anchorKey: string,
  delta: number,
) {
  if (view === 'day') return addDaysToKey(anchorKey, delta);
  if (view === 'week') return addDaysToKey(anchorKey, delta * 7);
  return `${shiftMonthKey(anchorKey.slice(0, 7), delta)}-01`;
}

/** Whether every day of a range falls inside the window the listener loads for a month. */
export function isRangeInWindow(
  { startKey, endKey }: DayRange,
  monthKey: string,
) {
  const { start, end } = getMonthWindow(monthKey);
  return getDateOfDayKey(startKey) >= start && getDateOfDayKey(endKey) < end;
}

export const isDayInRange = (dayKey: string, { startKey, endKey }: DayRange) =>
  dayKey >= startKey && dayKey <= endKey;

const weekRangeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const weekRangeYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "October 2026", "Oct 11 – 17" or "Mon, Oct 12"; a week outside the current year says its year. */
export function formatPeriodTitle(
  view: CalendarView,
  anchorKey: string,
  todayKey: string,
) {
  if (view === 'month') return formatMonthTitle(anchorKey.slice(0, 7));
  if (view === 'day') return formatDayTitle(anchorKey);
  const { startKey, endKey } = getPeriodRange('week', anchorKey);
  const isThisYear =
    startKey.slice(0, 4) === todayKey.slice(0, 4) &&
    endKey.slice(0, 4) === todayKey.slice(0, 4);
  return (isThisYear ? weekRangeFormatter : weekRangeYearFormatter).formatRange(
    getDateOfDayKey(startKey),
    getDateOfDayKey(endKey),
  );
}
