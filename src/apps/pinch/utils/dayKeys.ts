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
const shortDayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const shortDayWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
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

/** A day's heading in its drawer and hover card: the weekday and date, led by "Today" on the clock's today. */
export const formatDayHeading = (dayKey: string, isToday: boolean) =>
  isToday ? `Today · ${formatDayTitle(dayKey)}` : formatDayTitle(dayKey);

/** "Oct 12", with the year when it isn't the viewer's current one. */
export const formatDayShort = (dayKey: string, now = Date.now()) =>
  (dayKey.slice(0, 4) === toLocalDateInputValue(now).slice(0, 4)
    ? shortDayFormatter
    : shortDayWithYearFormatter
  ).format(getDateOfDayKey(dayKey));

/** "Tuesday". */
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

/** The days a view shows for its anchor day, both ends included; a rolling week (a phone's agenda) starts on the anchor instead of its Sunday. */
export function getPeriodRange(
  view: CalendarView,
  anchorKey: string,
  isRollingWeek = false,
): DayRange {
  if (view === 'week') {
    const startKey = isRollingWeek ? anchorKey : getWeekStartKey(anchorKey);
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
  isRollingWeek = false,
): DayRange {
  const { startKey, endKey } = getPeriodRange(view, anchorKey, isRollingWeek);
  if (view !== 'month') return { startKey, endKey };
  const gridStart = getWeekStartKey(startKey);
  return { startKey: gridStart, endKey: addDaysToKey(gridStart, 41) };
}

/** The anchor day one step away: a month or a week. */
export function shiftAnchor(
  view: CalendarView,
  anchorKey: string,
  delta: number,
) {
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

/** The days of today's Sunday-to-Saturday week that have already gone, oldest first; none on a Sunday. */
export const getEarlierThisWeekKeys = (todayKey: string) => {
  const startKey = getWeekStartKey(todayKey);
  const count = Math.round(
    (getDateOfDayKey(todayKey) - getDateOfDayKey(startKey)) / DAY_MS,
  );
  const keys = Array.from({ length: count }, (_, index) =>
    addDaysToKey(startKey, index),
  );
  return keys;
};

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

/** "October 2026" or "Oct 11 – 17"; a week outside the current year says its year. */
export function formatPeriodTitle(
  view: CalendarView,
  anchorKey: string,
  todayKey: string,
  isRollingWeek = false,
) {
  if (view === 'month') return formatMonthTitle(anchorKey.slice(0, 7));
  const { startKey, endKey } = getPeriodRange('week', anchorKey, isRollingWeek);
  const isThisYear =
    startKey.slice(0, 4) === todayKey.slice(0, 4) &&
    endKey.slice(0, 4) === todayKey.slice(0, 4);
  return (isThisYear ? weekRangeFormatter : weekRangeYearFormatter).formatRange(
    getDateOfDayKey(startKey),
    getDateOfDayKey(endKey),
  );
}
