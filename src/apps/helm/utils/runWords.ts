import { dayKeyToMs } from '@/utils/cadenceUtils';

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const clockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Sun, Nov 29" from a day key. */
export const formatRunDay = (dayKey: string) =>
  dayFormat.format(dayKeyToMs(dayKey));

/** "6:00 PM" from a floating "HH:mm". */
export const formatClockWords = (time: string) =>
  clockFormat.format(Date.parse(`1970-01-01T${time}:00Z`));
