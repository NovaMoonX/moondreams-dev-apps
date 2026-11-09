import { DAY_MS } from '@apps/helm/constants';
import { getDueDay } from '@apps/helm/utils/captureReading';
import type { TaskDue } from '@apps/helm/types';

export const DUE_SOON_DAYS = 7;

export const toTaskDue = (value: unknown): TaskDue | null => {
  if (typeof value !== 'object' || value === null) return null;
  const due = value as Record<string, unknown>;
  if (due.kind === 'day' && typeof due.date === 'number') {
    return { kind: 'day', date: due.date };
  }
  if (due.kind === 'moment' && typeof due.at === 'number') {
    return { kind: 'moment', at: due.at };
  }
  return null;
};

const getRelativeWord = (days: number) => {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return null;
};

/** "Fri, Nov 13", or "Tomorrow, 9:00 AM" for a moment. A day-only due reads in UTC and a moment in `timeZone`. */
export function formatTaskDue(due: TaskDue, timeZone: string, now: number) {
  const today = getDueDay({ kind: 'moment', at: now }, timeZone);
  const day = getDueDay(due, timeZone);
  const year = new Date(day).getUTCFullYear();
  const dayLabel =
    getRelativeWord(Math.round((day - today) / DAY_MS)) ??
    new Date(day).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(year === new Date(today).getUTCFullYear() ? {} : { year: 'numeric' }),
    });
  if (due.kind === 'day') return dayLabel;
  const time = new Date(due.at).toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dayLabel}, ${time}`;
}

/** How many days from today a due falls (negative once past). A day-only due is overdue only after its day ends. */
export const getDueDaysAway = (due: TaskDue, timeZone: string, now: number) =>
  Math.round(
    (getDueDay(due, timeZone) -
      getDueDay({ kind: 'moment', at: now }, timeZone)) /
      DAY_MS,
  );

export const isOverdue = (due: TaskDue, timeZone: string, now: number) =>
  due.kind === 'moment' ? due.at < now : getDueDaysAway(due, timeZone, now) < 0;

/** The instant a due sorts by: a day counts from its start. */
export const getDueSortKey = (due: TaskDue) =>
  due.kind === 'day' ? due.date : due.at;
