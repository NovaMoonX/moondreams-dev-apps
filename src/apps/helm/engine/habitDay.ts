import { countDueDays, isDueOn, type Cadence } from '@/utils/cadenceUtils';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { readZoneFor } from '@apps/helm/engine/whereabouts';

export type DayPart =
  'morning' | 'midday' | 'afternoon' | 'evening' | 'bedtime';

/** A time of the person's day: floating "HH:mm" in the profile's zone. The end may pass midnight, never the rollover. */
export interface ClockWindow {
  start: string;
  end: string;
}

export interface HabitScheduleLike {
  status: string;
  cadence: Cadence;
  windowState: Record<string, ClockWindow & { order: number }>;
  timesPerDay: number | null;
  startsOn: number;
  endsOn: number | null;
}

export interface HabitDayLike {
  entries: Record<
    string,
    { checks: Record<string, { status: string }>; count: number }
  >;
}

export const HABIT_DAY_ROLLOVER = '03:00';

export const DAY_PART_WINDOWS: Record<DayPart, ClockWindow> = {
  morning: { start: '07:00', end: '10:00' },
  midday: { start: '11:00', end: '14:00' },
  afternoon: { start: '14:00', end: '17:00' },
  evening: { start: '18:00', end: '21:00' },
  bedtime: { start: '21:00', end: '23:00' },
};

const DEFAULT_DAY_START = '08:00';
const DEFAULT_DAY_END = '22:00';
const DAY_MS = 86_400_000;
const DAY_MINUTES = 24 * 60;
const SPLIT_MINUTES = 14 * 60;
const PART_MINUTES = 120;
const BEDTIME_MINUTES = 60;
const SAID_TIME_HALF_MINUTES = 30;

const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const toClock = (minutes: number) => {
  const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

const toMs = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const shiftKey = (dayKey: string, days: number) =>
  toKey(toMs(dayKey) + days * DAY_MS);

const formats = new Map<string, Intl.DateTimeFormat>();

const readLocal = (at: number, timeZone: string) => {
  const format =
    formats.get(timeZone) ??
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
  formats.set(timeZone, format);
  const parts = format.formatToParts(new Date(at));
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return {
    key: `${read('year')}-${read('month')}-${read('day')}`,
    hour: Number(read('hour')),
  };
};

/** The habit day an instant belongs to: the zone's calendar day, with a check before the 03:00 rollover counting for the day before. */
export function habitDayKey(at: number, timeZone: string): string {
  const local = readLocal(at, timeZone);
  return local.hour < toMinutes(HABIT_DAY_ROLLOVER) / 60
    ? shiftKey(local.key, -1)
    : local.key;
}

/** The zone a habit's day follows (an away span's while one covers the day) and the day an instant falls on in it. */
export function readHabitClock(
  at: number,
  profile: {
    timeZone: string;
    zoneSpans: { zone: string; from: number; to: number; awayId?: string }[];
  },
  awayIds: string[] | null = null,
): { dayKey: string; timeZone: string } {
  const homeKey = habitDayKey(at, profile.timeZone);
  const timeZone = readZoneFor(homeKey, profile, awayIds);
  return { dayKey: habitDayKey(at, timeZone), timeZone };
}

/** The named parts of the day: they follow the person's day, or a fixed table while Your day was never set. */
export function dayPartWindows(profile: {
  dayStartTime: string;
  dayEndTime: string;
}): Record<DayPart, ClockWindow> {
  if (
    profile.dayStartTime === DEFAULT_DAY_START &&
    profile.dayEndTime === DEFAULT_DAY_END
  ) {
    return DAY_PART_WINDOWS;
  }
  const start = toMinutes(profile.dayStartTime);
  const end = toMinutes(profile.dayEndTime);
  const morningEnd = Math.min(start + PART_MINUTES, end);
  const eveningStart = Math.max(end - PART_MINUTES, morningEnd);
  const split =
    SPLIT_MINUTES > morningEnd && SPLIT_MINUTES < eveningStart
      ? SPLIT_MINUTES
      : Math.round((morningEnd + eveningStart) / 2);
  const span = (from: number, to: number) => ({
    start: toClock(from),
    end: toClock(to),
  });
  return {
    morning: span(start, morningEnd),
    midday: span(morningEnd, split),
    afternoon: span(split, eveningStart),
    evening: span(eveningStart, end),
    bedtime: span(end, end + BEDTIME_MINUTES),
  };
}

/** A window of an hour around a time the person said ("at 8" is 07:30 to 08:30). */
export function saidTimeWindow(time: string): ClockWindow {
  const at = toMinutes(time);
  return {
    start: toClock(Math.max(at - SAID_TIME_HALF_MINUTES, 0)),
    end: toClock(at + SAID_TIME_HALF_MINUTES),
  };
}

/** The instants a window covers on a habit day; an end at or before the start lands on the next date, and never later than the rollover. */
export function windowInstants(
  dayKey: string,
  window: ClockWindow,
  timeZone: string,
): { startAt: number; endAt: number } {
  const startAt = zonedDateTimeToEpoch(dayKey, window.start, timeZone);
  if (toMinutes(window.end) > toMinutes(window.start)) {
    return {
      startAt,
      endAt: zonedDateTimeToEpoch(dayKey, window.end, timeZone),
    };
  }
  const next = shiftKey(dayKey, 1);
  return {
    startAt,
    endAt: Math.min(
      zonedDateTimeToEpoch(next, window.end, timeZone),
      zonedDateTimeToEpoch(next, HABIT_DAY_ROLLOVER, timeZone),
    ),
  };
}

/** A habit's windows on a habit day in order, as instants. */
export function readWindowSpans(
  habit: Pick<HabitScheduleLike, 'windowState'>,
  dayKey: string,
  timeZone: string,
): { id: string; startAt: number; endAt: number }[] {
  return Object.entries(habit.windowState)
    .sort(([, first], [, second]) => first.order - second.order)
    .map(([id, window]) => ({
      id,
      ...windowInstants(dayKey, window, timeZone),
    }));
}

/** Whether the habit asks for something on this day. */
export function isHabitDue(habit: HabitScheduleLike, dayKey: string): boolean {
  const day = toMs(dayKey);
  return (
    habit.status === 'active' &&
    habit.startsOn <= day &&
    (habit.endsOn === null || day <= habit.endsOn) &&
    isDueOn(habit.cadence, dayKey)
  );
}

/** The window an instant falls in on its habit day, or null between windows. */
export function openWindowAt(
  habit: Pick<HabitScheduleLike, 'windowState'>,
  at: number,
  timeZone: string,
): string | null {
  const spans = readWindowSpans(habit, habitDayKey(at, timeZone), timeZone);
  return (
    spans.find((span) => span.startAt <= at && at < span.endAt)?.id ?? null
  );
}

const unitsPerDay = (habit: HabitScheduleLike) =>
  habit.timesPerDay === null
    ? Math.max(Object.keys(habit.windowState).length, 1)
    : 1;

const doneUnits = (
  habit: HabitScheduleLike,
  entry: HabitDayLike['entries'][string] | undefined,
) => {
  if (!entry) return 0;
  if (habit.timesPerDay !== null)
    return entry.count >= habit.timesPerDay ? 1 : 0;
  const ids = Object.keys(habit.windowState);
  const isDone = (id: string) => entry.checks[id]?.status === 'done';
  return ids.length === 0 ? Number(isDone('day')) : ids.filter(isDone).length;
};

/** This week's figure in the habit's own unit, Monday to today, counting only the days it asked for so far; today counts once it is done. A times-a-week habit counts days and is met once its count is. */
export function selectHabitWeek(
  habit: HabitScheduleLike & { id: string },
  days: Record<string, HabitDayLike>,
  todayKey: string,
): { done: number; due: number } {
  const monday = shiftKey(
    todayKey,
    -((new Date(toMs(todayKey)).getUTCDay() + 6) % 7),
  );
  const from = toKey(Math.max(toMs(monday), habit.startsOn));
  const to = toKey(
    Math.min(toMs(todayKey), habit.endsOn === null ? Infinity : habit.endsOn),
  );
  if (to < from) return { done: 0, due: 0 };
  const keys = Array.from(
    { length: Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1 },
    (_, at) => shiftKey(from, at),
  );
  const unitsOf = (key: string) =>
    doneUnits(habit, days[key]?.entries[habit.id]);
  const full = unitsPerDay(habit);
  if (habit.cadence.kind === 'timesPerWeek') {
    const due = countDueDays(habit.cadence, from, to);
    return {
      done: Math.min(keys.filter((key) => unitsOf(key) >= full).length, due),
      due,
    };
  }
  return keys
    .filter((key) => isDueOn(habit.cadence, key))
    .reduce(
      (total, key) => {
        const units = Math.min(unitsOf(key), full);
        if (key === todayKey) {
          return {
            done: total.done + units,
            due: total.due + units,
          };
        }
        return { done: total.done + units, due: total.due + full };
      },
      { done: 0, due: 0 },
    );
}
