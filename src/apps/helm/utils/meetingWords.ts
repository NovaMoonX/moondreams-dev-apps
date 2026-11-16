import { getDateTimeFormat } from '@/utils/timezoneUtils';
import { formatDayName, toDayKey } from '@apps/helm/utils/planDays';

/** "today", "tomorrow" or the weekday a meeting falls on, in the person's zone. */
export const getMeetingDay = (startAt: number, now: number, timeZone: string) =>
  formatDayName(toDayKey(startAt, timeZone), toDayKey(now, timeZone));

/** "Mon 10:00 AM" */
export const formatMeetingWhen = (startAt: number, timeZone: string) =>
  getDateTimeFormat({
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(startAt))
    .replace(',', '');
