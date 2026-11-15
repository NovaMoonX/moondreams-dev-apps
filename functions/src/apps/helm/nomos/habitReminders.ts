// Generated from src/apps/helm/engine/habitReminders.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import {
  dayKeyToMs as toMs,
  isDueOn,
  shiftDayKeyBy as shiftKey,
} from '../../../vendor/cadenceUtils.js';
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import {
  dayPartWindows,
  habitDayKey,
  readHabitStatusOn,
  readWindowSpans,
  windowInstants,
  type ClockWindow,
  type DayPart,
} from './habitDay.js';
import type {
  LifeDay,
  LifeHabit,
  LifeStage,
} from './habitLife.js';

export const HABIT_REMINDERS_PER_DAY = 6;
/** Days with nothing in use before reminders pause until the person is back; null never pauses them. */
export const HABIT_REMINDERS_IDLE_DAYS: number | null = 21;

const MINUTE = 60_000;
const ROUND = 5 * MINUTE;
const HOUR = 60 * MINUTE;
const LATE_BEFORE_END = 30 * MINUTE;
const LATE_NO_WINDOW_BEFORE_END = 2 * HOUR;
const BUNDLE = 15 * MINUTE;
const SOON = MINUTE;
const GOES_QUIET_DAYS = 14;
const ROLLOVER_MINUTES = 180;

export interface ReminderHabit extends LifeHabit {
  reminder: {
    isOn: boolean;
    pace: 'adaptive' | 'start' | 'late';
    anyTimeAt: string | null;
    allowQuietHours: boolean;
  } | null;
  windowState: Record<
    string,
    ClockWindow & {
      order: number;
      editedAt: number | null;
      part: DayPart | null;
    }
  >;
}

export interface ReminderProfile {
  timeZone: string;
  dayStartTime: string;
  dayEndTime: string;
  quietHours: { start: string; end: string } | null;
  remindersPausedAt: number | null;
  habitRemindersIdleAt: number | null;
}

export interface WantedSlot {
  fireAt: number;
  /** "habitId/windowId", windowId 'day' for a habit with no window. */
  refs: string[];
  part: DayPart | null;
  kind: 'habits' | 'idle';
}

export interface PlannedSlot {
  id: string;
  fireAt: number;
  refs: string[];
}

type Fire = 'start' | 'late' | 'none';

const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const floorToFive = (at: number) => Math.floor(at / ROUND) * ROUND;

/** A floating clock span on a day that may end on the next date (never clamped to the rollover). */
const spanOn = (day: string, window: ClockWindow, zone: string) => {
  const startAt = zonedDateTimeToEpoch(day, window.start, zone);
  return {
    startAt,
    endAt:
      toMinutes(window.end) > toMinutes(window.start)
        ? zonedDateTimeToEpoch(day, window.end, zone)
        : zonedDateTimeToEpoch(shiftKey(day, 1), window.end, zone),
  };
};

const readFire = (habit: ReminderHabit, stage: LifeStage | null): Fire => {
  const pace = habit.reminder?.pace ?? 'adaptive';
  if (pace === 'late') return 'late';
  if (pace === 'start' || habit.isCare) return 'start';
  if (stage === 'formed') return 'none';
  return stage === 'holding' ? 'late' : 'start';
};

interface Unit {
  id: string;
  part: DayPart | null;
  window: { startAt: number; endAt: number } | null;
}

const readUnits = (
  habit: ReminderHabit,
  dayKey: string,
  zone: string,
): Unit[] =>
  habit.timesPerDay !== null || Object.keys(habit.windowState).length === 0
    ? [{ id: 'day', part: null, window: null }]
    : readWindowSpans(habit, dayKey, zone).map((span) => ({
        id: span.id,
        part: habit.windowState[span.id].part,
        window: { startAt: span.startAt, endAt: span.endAt },
      }));

const rawFireAt = (
  habit: ReminderHabit,
  unit: Unit,
  fire: Exclude<Fire, 'none'>,
  dayKey: string,
  profile: ReminderProfile,
) => {
  const zone = profile.timeZone;
  if (unit.window) {
    const { startAt, endAt } = unit.window;
    if (fire === 'start') return floorToFive(startAt);
    return floorToFive(
      endAt - startAt < HOUR
        ? startAt + (endAt - startAt) / 2
        : endAt - LATE_BEFORE_END,
    );
  }
  const today = spanOn(
    dayKey,
    { start: profile.dayStartTime, end: profile.dayEndTime },
    zone,
  );
  if (fire === 'late')
    return floorToFive(today.endAt - LATE_NO_WINDOW_BEFORE_END);
  const anyTimeAt =
    habit.timesPerDay === null ? habit.reminder?.anyTimeAt : null;
  if (!anyTimeAt) return floorToFive((today.startAt + today.endAt) / 2);
  const date =
    toMinutes(anyTimeAt) < ROLLOVER_MINUTES ? shiftKey(dayKey, 1) : dayKey;
  return floorToFive(zonedDateTimeToEpoch(date, anyTimeAt, zone));
};

type Interval = { startAt: number; endAt: number };

const blockedOn = (dayKey: string, profile: ReminderProfile): Interval[] => {
  const zone = profile.timeZone;
  if (profile.quietHours) {
    const quiet = profile.quietHours;
    return [-1, 0, 1].map((offset) =>
      spanOn(shiftKey(dayKey, offset), quiet, zone),
    );
  }
  const today = spanOn(
    dayKey,
    { start: profile.dayStartTime, end: profile.dayEndTime },
    zone,
  );
  return [
    { startAt: -Infinity, endAt: today.startAt },
    { startAt: today.endAt, endAt: Infinity },
  ];
};

const subtract = (span: Interval, blocked: Interval[]): Interval[] =>
  blocked.reduce<Interval[]>(
    (parts, block) =>
      parts.flatMap((part) =>
        block.endAt <= part.startAt || block.startAt >= part.endAt
          ? [part]
          : [
              ...(block.startAt > part.startAt
                ? [{ startAt: part.startAt, endAt: block.startAt }]
                : []),
              ...(block.endAt < part.endAt
                ? [{ startAt: block.endAt, endAt: part.endAt }]
                : []),
            ],
      ),
    [span],
  );

/** A fire time inside quiet hours moves to the nearest minute of its window outside them (just before or just after); null when the window lies wholly inside. */
const moveOutOfQuiet = (
  fireAt: number,
  unit: Unit,
  habit: ReminderHabit,
  dayKey: string,
  profile: ReminderProfile,
): number | null => {
  const blocked = blockedOn(dayKey, profile);
  const isInside = blocked.some(
    (block) => block.startAt <= fireAt && fireAt < block.endAt,
  );
  if (!isInside || habit.reminder?.allowQuietHours) return fireAt;
  const window =
    unit.window ??
    spanOn(
      dayKey,
      { start: profile.dayStartTime, end: profile.dayEndTime },
      profile.timeZone,
    );
  return subtract(window, blocked)
    .map((part) => (fireAt < part.startAt ? part.startAt : part.endAt - MINUTE))
    .reduce<number | null>(
      (best, option) =>
        best === null || Math.abs(option - fireAt) < Math.abs(best - fireAt)
          ? option
          : best,
      null,
    );
};

/** A window ticked before its fire time on every due day of the last two weeks needs no reminder until it misses one. */
const isKeepingItself = (
  habit: ReminderHabit,
  unit: Unit,
  fire: Exclude<Fire, 'none'>,
  dayKey: string,
  days: Record<string, LifeDay>,
  profile: ReminderProfile,
) => {
  if (!unit.window) return false;
  const editedAt = habit.windowState[unit.id]?.editedAt ?? null;
  const dueDays = Array.from({ length: GOES_QUIET_DAYS }, (_, at) =>
    shiftKey(dayKey, -(at + 1)),
  ).filter(
    (key) =>
      toMs(key) >= habit.startsOn &&
      (editedAt === null || key >= habitDayKey(editedAt, profile.timeZone)) &&
      isDueOn(habit.cadence, key),
  );
  return (
    dueDays.length > 0 &&
    dueDays.every((key) => {
      const span = readWindowSpans(habit, key, profile.timeZone).find(
        (one) => one.id === unit.id,
      );
      const checkedAt = days[key]?.entries[habit.id]?.checks[unit.id];
      return (
        span !== undefined &&
        checkedAt?.status === 'done' &&
        checkedAt.at <
          rawFireAt(habit, { ...unit, window: span }, fire, key, profile)
      );
    })
  );
};

const partAt = (
  fireAt: number,
  dayKey: string,
  profile: ReminderProfile,
): DayPart | null =>
  (Object.entries(dayPartWindows(profile)) as [DayPart, ClockWindow][]).find(
    ([, window]) => {
      const span = windowInstants(dayKey, window, profile.timeZone);
      return span.startAt <= fireAt && fireAt < span.endAt;
    },
  )?.[0] ?? null;

const isUnitDone = (
  habit: ReminderHabit,
  unit: Unit,
  day: LifeDay | undefined,
) => {
  const entry = day?.entries[habit.id];
  if (!entry) return false;
  if (habit.timesPerDay !== null) return entry.count >= habit.timesPerDay;
  const status = entry.checks[unit.id]?.status;
  return status === 'done' || status === 'skipped';
};

const isWeekMet = (
  habit: ReminderHabit,
  dayKey: string,
  days: Record<string, LifeDay>,
) => {
  if (habit.cadence.kind !== 'timesPerWeek') return false;
  const monday = shiftKey(
    dayKey,
    -((new Date(toMs(dayKey)).getUTCDay() + 6) % 7),
  );
  const doneDays = Array.from({ length: 7 }, (_, at) => shiftKey(monday, at))
    .filter((key) => key < dayKey)
    .filter((key) =>
      readUnits(habit, key, 'UTC').every(
        (unit) =>
          days[key]?.entries[habit.id]?.checks[unit.id]?.status === 'done' ||
          (habit.timesPerDay !== null &&
            (days[key]?.entries[habit.id]?.count ?? 0) >= habit.timesPerDay),
      ),
    );
  return doneDays.length >= habit.cadence.count;
};

interface Item {
  fireAt: number;
  ref: string;
  part: DayPart | null;
}

const readItems = (
  habit: ReminderHabit,
  dayKey: string,
  days: Record<string, LifeDay>,
  profile: ReminderProfile,
): Item[] => {
  const isDue =
    habit.reminder?.isOn === true &&
    readHabitStatusOn(habit, dayKey) === 'active' &&
    toMs(dayKey) >= habit.startsOn &&
    (habit.endsOn === null || toMs(dayKey) <= habit.endsOn) &&
    isDueOn(habit.cadence, dayKey) &&
    !isWeekMet(habit, dayKey, days);
  const fire = readFire(habit, habit.stage);
  if (!isDue || fire === 'none') return [];
  return readUnits(habit, dayKey, profile.timeZone).flatMap((unit) => {
    if (isUnitDone(habit, unit, days[dayKey])) return [];
    if (
      habit.reminder?.pace === 'adaptive' &&
      isKeepingItself(habit, unit, fire, dayKey, days, profile)
    )
      return [];
    const fireAt = moveOutOfQuiet(
      rawFireAt(habit, unit, fire, dayKey, profile),
      unit,
      habit,
      dayKey,
      profile,
    );
    return fireAt === null
      ? []
      : [
          {
            fireAt,
            ref: `${habit.id}/${unit.id}`,
            part: unit.part ?? partAt(fireAt, dayKey, profile),
          },
        ];
  });
};

const bundle = (items: Item[]): WantedSlot[] => {
  const groups = [...items]
    .sort((first, second) => first.fireAt - second.fireAt)
    .reduce<Item[][]>((all, item) => {
      const last = all[all.length - 1];
      return last && item.fireAt - last[0].fireAt <= BUNDLE
        ? [...all.slice(0, -1), [...last, item]]
        : [...all, [item]];
    }, []);
  const capped = [
    ...groups.slice(0, HABIT_REMINDERS_PER_DAY - 1),
    groups.slice(HABIT_REMINDERS_PER_DAY - 1).flat(),
  ].filter((group) => group.length > 0);
  return capped.map((group) => ({
    fireAt: group[0].fireAt,
    refs: group.map((item) => item.ref).sort(),
    part: group.every((item) => item.part === group[0].part)
      ? group[0].part
      : null,
    kind: 'habits',
  }));
};

/** Whether nothing was in use on any of the last `HABIT_REMINDERS_IDLE_DAYS` habit days up to and including `dayKey`. */
export function isRemindersIdle(
  days: Record<string, LifeDay>,
  dayKey: string,
): boolean {
  if (HABIT_REMINDERS_IDLE_DAYS === null) return false;
  return !Array.from({ length: HABIT_REMINDERS_IDLE_DAYS }, (_, at) =>
    shiftKey(dayKey, -at),
  ).some((key) => days[key]?.isInUse === true);
}

/** The rest of a habit day's reminders, after now + 60 seconds. Reads only readable fields. While reminders are paused it plans nothing; once idle it plans the one closing reminder (kind 'idle') until `habitRemindersIdleAt` is set, then nothing. */
export function planHabitDay(input: {
  now: number;
  dayKey: string;
  profile: ReminderProfile;
  habits: ReminderHabit[];
  days: Record<string, LifeDay>;
}): WantedSlot[] {
  const { now, dayKey, profile, habits, days } = input;
  if (profile.remindersPausedAt !== null) return [];
  const isIdle = isRemindersIdle(days, dayKey);
  if (isIdle && profile.habitRemindersIdleAt !== null) return [];
  const slots = bundle(
    habits.flatMap((habit) => readItems(habit, dayKey, days, profile)),
  ).filter((slot) => slot.fireAt > now + SOON);
  if (!isIdle) return slots;
  return slots.slice(0, 1).map((slot) => ({
    ...slot,
    refs: [],
    kind: 'idle' as const,
  }));
}

const sameRefs = (first: string[], second: string[]) =>
  first.length === second.length &&
  [...first].sort().every((ref, at) => ref === [...second].sort()[at]);

/** What to create and cancel to bring the planned slots to the wanted ones; a planned slot firing within 60 seconds is left alone. */
export function diffSlots(
  planned: PlannedSlot[],
  wanted: WantedSlot[],
  now: number,
): { create: WantedSlot[]; cancel: PlannedSlot[] } {
  const isSame = (slot: PlannedSlot, one: WantedSlot) =>
    slot.fireAt === one.fireAt && sameRefs(slot.refs, one.refs);
  return {
    create: wanted.filter((one) => !planned.some((slot) => isSame(slot, one))),
    cancel: planned.filter(
      (slot) =>
        slot.fireAt > now + SOON && !wanted.some((one) => isSame(slot, one)),
    ),
  };
}

export const HABIT_REMINDER_WORDS = {
  many: (part: DayPart) => `Your ${part} habits are up`,
  one: (part: DayPart) => `Time for your ${part} habit`,
  noPartMany: 'Habits are waiting for you',
  noPartOne: 'A habit is waiting for you',
  idle: 'Last reminder for now. Tick a habit to bring them back.',
};

/** The stored words: fixed, never a habit's name. */
export function reminderBody(input: {
  part: DayPart | null;
  count: number;
}): string {
  const isOne = input.count <= 1;
  if (input.part === null)
    return isOne
      ? HABIT_REMINDER_WORDS.noPartOne
      : HABIT_REMINDER_WORDS.noPartMany;
  return isOne
    ? HABIT_REMINDER_WORDS.one(input.part)
    : HABIT_REMINDER_WORDS.many(input.part);
}

const joinNames = (names: string[]) =>
  names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The lock-screen words: only the names the person chose to show; the rest are counted. With no name it falls back to the fixed words. */
export function lockScreenBody(
  names: string[],
  leftCount: number,
  part: DayPart | null,
): string {
  if (names.length === 0) return reminderBody({ part, count: leftCount });
  const rest = Math.max(0, leftCount - names.length);
  if (rest === 0) return joinNames(names);
  return `${joinNames(names)} and ${rest} more ${part ? `${part} ` : ''}habit${rest === 1 ? '' : 's'}`;
}
