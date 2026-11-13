import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';

export type RestDayKind = 'shift' | 'late';

export interface RestDayEvent {
  startAt: number | null;
  endAt: number | null;
  isAllDay: boolean;
  isBusy: boolean | null;
  calendarKey: string | null;
}

const DAY_MS = 86_400_000;
const REST_UNTIL = '02:00';
// A longer event (a conference, a week away) is not a night out.
const LATEST_END = '12:00';

const getPreviousKey = (dayKey: string) =>
  new Date(Date.parse(`${dayKey}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Whether the day after a night out or a night shift is one to leave empty: a busy timed event that began the day before and ran past 02:00. `'shift'` when only the marked shift calendars were read. */
export function readRestDay(input: {
  dayKey: string;
  timeZone: string;
  events: RestDayEvent[];
  shiftCalendarIds: string[];
}): RestDayKind | null {
  const { dayKey, timeZone, events, shiftCalendarIds } = input;
  const previousStart = zonedDateTimeToEpoch(
    getPreviousKey(dayKey),
    '00:00',
    timeZone,
  );
  const dayStart = zonedDateTimeToEpoch(dayKey, '00:00', timeZone);
  const restUntil = zonedDateTimeToEpoch(dayKey, REST_UNTIL, timeZone);
  const latestEnd = zonedDateTimeToEpoch(dayKey, LATEST_END, timeZone);
  const isShift = shiftCalendarIds.length > 0;
  const hasOvernight = events.some(
    (event) =>
      !event.isAllDay &&
      event.isBusy !== false &&
      event.startAt !== null &&
      event.endAt !== null &&
      event.startAt >= previousStart &&
      event.startAt < dayStart &&
      event.endAt > restUntil &&
      event.endAt <= latestEnd &&
      (!isShift ||
        (event.calendarKey !== null &&
          shiftCalendarIds.includes(event.calendarKey))),
  );
  if (!hasOvernight) return null;
  return isShift ? 'shift' : 'late';
}
