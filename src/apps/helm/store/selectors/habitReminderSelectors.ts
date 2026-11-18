import type { RootState } from '@/store';
import type { OpenHabit } from '@apps/helm/types';

const names = (refs: string[] | null | undefined, habitId: string) =>
  (refs ?? []).some((ref) => ref === habitId || ref.startsWith(`${habitId}/`));

/** The instant of the next pending Helm reminder that names the habit, from the site's own reminders slice (the queue is Admin-only); null when none is coming. */
export const selectNextHabitReminder = (
  state: RootState,
  habitId: string,
  now: number,
): number | null =>
  state.reminders.items
    .filter(
      (reminder) =>
        reminder.appId === 'helm' &&
        reminder.status === 'pending' &&
        reminder.scheduledFor > now &&
        names(reminder.subjectRefs, habitId),
    )
    .reduce<number | null>(
      (next, reminder) =>
        next === null || reminder.scheduledFor < next
          ? reminder.scheduledFor
          : next,
      null,
    );

/** How many running habits have reminders on, for Settings' line. */
export const countHabitsReminding = (habits: OpenHabit[]) =>
  habits.filter(
    (habit) =>
      !habit.isUnreadable &&
      (habit.status === 'active' || habit.status === 'paused') &&
      habit.reminder?.isOn === true,
  ).length;
