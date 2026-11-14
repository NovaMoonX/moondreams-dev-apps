import {
  dayKeyToMs as toMs,
  isDueOn,
  msToDayKey as toKey,
  shiftDayKeyBy as shiftKey,
  type Cadence,
} from '@/utils/cadenceUtils';
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
  pausedAt?: number | null;
  pausedUntil?: number | null;
  /** Its status history: a pause that was resumed by hand stays excluded from the week. */
  history?: { kind: string; at: number }[];
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

/** A window can start from the rollover on: an earlier start falls in the day before. */
export const isWindowStartAllowed = (start: string) =>
  toMinutes(start) >= toMinutes(HABIT_DAY_ROLLOVER);

/** A window whose start is before the rollover starts at it instead, keeping its end when that is later. */
export function toAllowedWindow(window: ClockWindow): ClockWindow {
  if (isWindowStartAllowed(window.start)) return window;
  const rollover = toMinutes(HABIT_DAY_ROLLOVER);
  return {
    start: HABIT_DAY_ROLLOVER,
    end:
      toMinutes(window.end) > rollover
        ? window.end
        : toClock(rollover + SAID_TIME_HALF_MINUTES),
  };
}

/** A window of an hour around a time the person said ("at 8" is 07:30 to 08:30); a time after midnight is the tail of the evening before, ending by the rollover. */
export function saidTimeWindow(time: string): ClockWindow {
  const at = toMinutes(time);
  const rollover = toMinutes(HABIT_DAY_ROLLOVER);
  if (at < rollover) {
    return {
      start: '23:30',
      end: toClock(Math.min(at + SAID_TIME_HALF_MINUTES, rollover)),
    };
  }
  return {
    start: toClock(Math.max(at - SAID_TIME_HALF_MINUTES, rollover)),
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

/** A paused habit whose day has come is active again, so coming back needs no write. */
export function readHabitStatusOn<Status extends string>(
  habit: { status: Status; pausedUntil?: number | null },
  dayKey: string,
): Status | 'active' {
  return habit.status === 'paused' &&
    habit.pausedUntil != null &&
    habit.pausedUntil <= toMs(dayKey)
    ? 'active'
    : habit.status;
}

/** The days a habit was paused: each pause up to the event that ended it (a resume by hand included), then the current one up to its end date. */
const readPauseSpans = (habit: HabitScheduleLike, timeZone: string) => {
  const events = [...(habit.history ?? [])].sort(
    (first, second) => first.at - second.at,
  );
  const closed = events.flatMap((event, at) =>
    event.kind === 'paused' && events[at + 1]
      ? [
          {
            from: habitDayKey(event.at, timeZone),
            to: habitDayKey(events[at + 1].at, timeZone),
          },
        ]
      : [],
  );
  return habit.pausedAt != null
    ? [
        ...closed,
        {
          from: habitDayKey(habit.pausedAt, timeZone),
          to: habit.pausedUntil != null ? toKey(habit.pausedUntil) : null,
        },
      ]
    : closed;
};

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

const skippedUnits = (
  habit: HabitScheduleLike,
  entry: HabitDayLike['entries'][string] | undefined,
) => {
  if (!entry) return 0;
  const isSkipped = (id: string) => entry.checks[id]?.status === 'skipped';
  if (habit.timesPerDay !== null)
    return isSkipped('day') && entry.count < habit.timesPerDay ? 1 : 0;
  const ids = Object.keys(habit.windowState);
  return ids.length === 0
    ? Number(isSkipped('day'))
    : ids.filter(isSkipped).length;
};

/** This week's figure in the habit's own unit, Monday to today, counting only the days it asked for so far; today counts once it is done. A skipped unit is neither done nor missed: it leaves `due` and is counted in `skipped`. A times-a-week habit counts days and is met once its count is. `due: 0` means nothing has been asked yet ("Starts today"). Days in a pause, read in `timeZone`, are left out. */
export function selectHabitWeek(
  habit: HabitScheduleLike & { id: string },
  days: Record<string, HabitDayLike>,
  todayKey: string,
  timeZone: string,
): { done: number; due: number; skipped: number } {
  const monday = shiftKey(
    todayKey,
    -((new Date(toMs(todayKey)).getUTCDay() + 6) % 7),
  );
  const from = toKey(Math.max(toMs(monday), habit.startsOn));
  const to = toKey(
    Math.min(toMs(todayKey), habit.endsOn === null ? Infinity : habit.endsOn),
  );
  if (to < from) return { done: 0, due: 0, skipped: 0 };
  const keys = Array.from(
    { length: Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1 },
    (_, at) => shiftKey(from, at),
  );
  const entryOf = (key: string) => days[key]?.entries[habit.id];
  const full = unitsPerDay(habit);
  const spans = readPauseSpans(habit, timeZone);
  const open = keys.filter(
    (key) =>
      !spans.some(
        (span) => key >= span.from && (span.to === null || key < span.to),
      ),
  );
  if (habit.cadence.kind === 'timesPerWeek') {
    const asked = open.filter(
      (key) =>
        doneUnits(habit, entryOf(key)) >= full ||
        skippedUnits(habit, entryOf(key)) < full,
    );
    const due = Math.min(habit.cadence.count, asked.length);
    return {
      done: Math.min(
        asked.filter((key) => doneUnits(habit, entryOf(key)) >= full).length,
        due,
      ),
      due,
      skipped: open.length - asked.length,
    };
  }
  return open
    .filter((key) => isDueOn(habit.cadence, key))
    .reduce(
      (total, key) => {
        const done = Math.min(doneUnits(habit, entryOf(key)), full);
        const skipped = Math.min(
          skippedUnits(habit, entryOf(key)),
          full - done,
        );
        return {
          done: total.done + done,
          due: total.due + (key === todayKey ? done : full - skipped),
          skipped: total.skipped + skipped,
        };
      },
      { done: 0, due: 0, skipped: 0 },
    );
}
