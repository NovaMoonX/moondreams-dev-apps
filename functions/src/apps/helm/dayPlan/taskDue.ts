// The due-date reading the vendored planner uses; keep in step with src/apps/helm/utils/taskDue.ts.
import type { TaskDue } from './plannerTypes.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DUE_SOON_DAYS = 7;

const getDueDay = (due: TaskDue, timeZone: string) => {
  if (due.kind === 'day') return due.date;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(due.at));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read('year'), read('month') - 1, read('day'));
};

const getRelativeWord = (days: number) => {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return null;
};

export function formatTaskDue(due: TaskDue, timeZone: string, now: number) {
  const today = getDueDay({ kind: 'moment', at: now }, timeZone);
  const day = getDueDay(due, timeZone);
  const dayLabel =
    getRelativeWord(Math.round((day - today) / DAY_MS)) ??
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(new Date(day).getUTCFullYear() === new Date(today).getUTCFullYear()
        ? {}
        : { year: 'numeric' }),
    }).format(new Date(day));
  if (due.kind === 'day') return dayLabel;
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(due.at));
  return `${dayLabel}, ${time}`;
}

export const getDueDaysAway = (due: TaskDue, timeZone: string, now: number) =>
  Math.round(
    (getDueDay(due, timeZone) -
      getDueDay({ kind: 'moment', at: now }, timeZone)) /
      DAY_MS,
  );

export const isOverdue = (due: TaskDue, timeZone: string, now: number) =>
  due.kind === 'moment' ? due.at < now : getDueDaysAway(due, timeZone, now) < 0;

export const getDueSortKey = (due: TaskDue) =>
  due.kind === 'day' ? due.date : due.at;
