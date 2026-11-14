import { getDateTimeFormat, zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { DAY_MS } from '@apps/helm/constants';
import { readZoneFor } from '@apps/helm/engine/whereabouts';
import type { PlanDay, PlanSlot, ZoneSpan } from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';

/** Days kept loaded: a day more than the strip holds on each side, since the listener's window is fixed when it starts. */
export const PLAN_DAYS_BEHIND = 2;
export const PLAN_DAYS_AHEAD = 8;

export const getPlanDaysWindow = (now: number) => {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return {
    fromDate: today - PLAN_DAYS_BEHIND * DAY_MS,
    toDate: today + PLAN_DAYS_AHEAD * DAY_MS,
  };
};

/** "YYYY-MM-DD" of the day an instant falls on in `timeZone`. */
export const toDayKey = (at: number, timeZone: string) =>
  new Date(getDueDay({ kind: 'moment', at }, timeZone))
    .toISOString()
    .slice(0, 10);

/** The zone today's clock follows: a chosen away span's when today's date in home time falls in one, else home's. */
export const readTodayZone = (
  now: number,
  profile: { timeZone: string; zoneSpans: ZoneSpan[] },
) => readZoneFor(toDayKey(now, profile.timeZone), profile);

export const shiftDayKey = (key: string, days: number) =>
  new Date(Date.parse(key) + days * DAY_MS).toISOString().slice(0, 10);

/** Yesterday, today and the six days after it. */
export const getStripKeys = (todayKey: string) =>
  Array.from({ length: 8 }, (_, index) => shiftDayKey(todayKey, index - 1));

/** A day's own noon: the instant that stands for the day when asking which of the day's things fall on it. */
export const getDayNoon = (key: string, timeZone: string) =>
  zonedDateTimeToEpoch(key, '12:00', timeZone);

export const formatClock = (at: number, timeZone: string) =>
  getDateTimeFormat({ timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(at),
  );

/** "1:15 to 1:35 PM", the meridiem said once when both ends share it. */
export function formatSlotRange(
  startAt: number,
  endAt: number,
  timeZone: string,
) {
  const start = formatClock(startAt, timeZone);
  const end = formatClock(endAt, timeZone);
  const suffix = (text: string) => text.slice(-2);
  return suffix(start) === suffix(end)
    ? `${start.slice(0, -3)} to ${end}`
    : `${start} to ${end}`;
}

/** "1h 30m", "45m". */
export const formatLength = (minutes: number) =>
  minutes < 60
    ? `${minutes}m`
    : minutes % 60 === 0
      ? `${minutes / 60}h`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

const dayLabel = (key: string, options: Intl.DateTimeFormatOptions) =>
  getDateTimeFormat({ timeZone: 'UTC', ...options }).format(
    new Date(Date.parse(key)),
  );

/** "Tue 10" for a strip pill. */
export const formatStripDay = (key: string) =>
  `${dayLabel(key, { weekday: 'short' })} ${dayLabel(key, { day: 'numeric' })}`;

/** "Today", "Tomorrow", "Yesterday", else "Fri, Nov 13". */
export function formatDayWord(key: string, todayKey: string) {
  if (key === todayKey) return 'Today';
  if (key === shiftDayKey(todayKey, 1)) return 'Tomorrow';
  if (key === shiftDayKey(todayKey, -1)) return 'Yesterday';
  return dayLabel(key, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "today", "tomorrow", "yesterday", else the weekday, for the middle of a sentence. */
export function formatDayName(key: string, todayKey: string) {
  if (key === todayKey) return 'today';
  if (key === shiftDayKey(todayKey, 1)) return 'tomorrow';
  if (key === shiftDayKey(todayKey, -1)) return 'yesterday';
  return dayLabel(key, { weekday: 'long' });
}

/** A day with no plan yet, or only slots a move put there. */
export const needsPlan = (day: PlanDay | undefined) =>
  !day || day.generatedAt === null;

export const isDecided = (slot: PlanSlot) => slot.status !== 'suggested';

/** The slots of a day in the order they show: timed ones by start, untimed after. */
export const sortSlots = (slots: Record<string, PlanSlot>) =>
  Object.entries(slots)
    .map(([id, slot]) => ({ id, slot }))
    .sort(
      (a, b) =>
        (a.slot.startAt ?? Number.MAX_SAFE_INTEGER) -
        (b.slot.startAt ?? Number.MAX_SAFE_INTEGER),
    );
