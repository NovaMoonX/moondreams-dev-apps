import { isHabitDue, readWindowSpans } from '@apps/helm/engine/habitDay';
import type { OpenHabit, OpenHabitDay } from '@apps/helm/types';
import { shiftDayKey } from '@apps/helm/utils/planDays';

export type WeekCell = 'done' | 'skipped' | 'open' | 'later';

export interface WeekDay {
  key: string;
  /** 0 is Sunday, as `Date` counts. */
  weekday: number;
  isOff: boolean;
  cells: WeekCell[];
  /** A counted habit's number for the day; null otherwise. */
  count: number | null;
  isReached: boolean;
  /** A counted habit's day the person said "not today" for, with the count short of its goal. */
  isSkipped: boolean;
}

const weekdayOf = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** The seven days of the week that holds today, Monday first: one cell per window (marked, skipped, not marked, still to come), or a counted habit's number; a day the habit is off is blank. */
export function readWeekDays(
  habit: OpenHabit,
  days: Record<string, OpenHabitDay>,
  clock: { now: number; dayKey: string; timeZone: string },
): WeekDay[] {
  const monday = shiftDayKey(
    clock.dayKey,
    -((weekdayOf(clock.dayKey) + 6) % 7),
  );
  const asActive = { ...habit, status: 'active' };
  return Array.from({ length: 7 }, (_, at) => {
    const key = shiftDayKey(monday, at);
    const entry = days[key]?.entries[habit.id];
    const isOff = !isHabitDue(asActive, key);
    const isFuture = key > clock.dayKey;
    const base = { key, weekday: weekdayOf(key), isOff };
    if (habit.timesPerDay !== null) {
      const count = isOff ? 0 : (entry?.count ?? 0);
      return {
        ...base,
        cells: [],
        count: isOff || isFuture ? null : count,
        isReached: count >= habit.timesPerDay,
        isSkipped:
          !isOff &&
          entry?.checks.day?.status === 'skipped' &&
          count < habit.timesPerDay,
      };
    }
    const spans =
      Object.keys(habit.windowState).length === 0
        ? [{ id: 'day', startAt: 0, endAt: 0 }]
        : readWindowSpans(habit, key, clock.timeZone);
    const cells = spans.map((span): WeekCell => {
      if (entry?.checks[span.id]?.status === 'done') return 'done';
      if (entry?.checks[span.id]?.status === 'skipped') return 'skipped';
      if (isFuture) return 'later';
      return key === clock.dayKey &&
        (span.id === 'day' || clock.now < span.endAt)
        ? 'later'
        : 'open';
    });
    return { ...base, cells, count: null, isReached: false, isSkipped: false };
  });
}
