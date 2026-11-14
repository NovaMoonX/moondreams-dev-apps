import {
  isHabitDue,
  readHabitStatusOn,
  readWindowSpans,
} from '@apps/helm/engine/habitDay';
import type { HabitCheck, OpenHabit, OpenHabitDay } from '@apps/helm/types';

export const readHabitStatus = (habit: OpenHabit, dayKey: string) =>
  readHabitStatusOn(habit, dayKey);

/** The habits as they stand on a day, a finished pause counted as over. */
export const readHabitsOn = (habits: readonly OpenHabit[], dayKey: string) =>
  habits.map((habit) => ({ ...habit, status: readHabitStatus(habit, dayKey) }));

export type HabitLineState = 'upcoming' | 'open' | 'ended' | 'done' | 'skipped';

/** One line on Today: a window of a habit, the habit's day, or a counted habit. */
export type HabitLine =
  | {
      kind: 'tick';
      id: string;
      habit: OpenHabit;
      windowId: string;
      label: string | null;
      startAt: number | null;
      endAt: number | null;
      check: HabitCheck | null;
      state: HabitLineState;
    }
  | {
      kind: 'tally';
      id: string;
      habit: OpenHabit;
      count: number;
      lastAt: number | null;
    };

/** Where a line sits among Today's timeline: an open window first, through-the-day lines next, the rest at their window's start. */
export const readHabitLineAt = (line: HabitLine) => {
  if (line.kind === 'tally') return -2;
  if (line.startAt === null) return -2;
  return line.state === 'open' ? -3 : line.startAt;
};

const readState = (
  check: HabitCheck | null,
  startAt: number | null,
  endAt: number | null,
  now: number,
): HabitLineState => {
  if (check) return check.status === 'done' ? 'done' : 'skipped';
  if (endAt !== null && now >= endAt) return 'ended';
  if (startAt !== null && now < startAt) return 'upcoming';
  return 'open';
};

/** The lines Today draws for the habits due on a habit day, one per window, one for a habit with none, one for a counted habit. */
export function readHabitLines(
  habits: readonly OpenHabit[],
  days: Record<string, OpenHabitDay>,
  clock: { now: number; dayKey: string; timeZone: string },
): HabitLine[] {
  const { now, dayKey, timeZone } = clock;
  return readHabitsOn(habits, dayKey)
    .filter((habit) => !habit.isUnreadable && isHabitDue(habit, dayKey))
    .flatMap((habit): HabitLine[] => {
      const entry = days[dayKey]?.entries[habit.id];
      if (habit.timesPerDay !== null) {
        return [
          {
            kind: 'tally',
            id: `${habit.id}/count`,
            habit,
            count: entry?.count ?? 0,
            lastAt: entry?.lastCountAt ?? null,
          },
        ];
      }
      if (Object.keys(habit.windowState).length === 0) {
        const check = entry?.checks.day ?? null;
        return [
          {
            kind: 'tick',
            id: `${habit.id}/day`,
            habit,
            windowId: 'day',
            label: null,
            startAt: null,
            endAt: null,
            check,
            state: readState(check, null, null, now),
          },
        ];
      }
      return readWindowSpans(habit, dayKey, timeZone).map((span) => {
        const check = entry?.checks[span.id] ?? null;
        return {
          kind: 'tick' as const,
          id: `${habit.id}/${span.id}`,
          habit,
          windowId: span.id,
          label: habit.windows[span.id]?.label ?? null,
          startAt: span.startAt,
          endAt: span.endAt,
          check,
          state: readState(check, span.startAt, span.endAt, now),
        };
      });
    });
}
