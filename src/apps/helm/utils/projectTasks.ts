import type { OpenTask } from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { isOverdue } from '@apps/helm/utils/taskDue';

/** A project's open tasks: overdue first, then by deadline, then the ones with no date, newest first within each. */
export function sortProjectTasks(
  tasks: OpenTask[],
  timeZone: string,
  now: number,
): OpenTask[] {
  const rank = (task: OpenTask) =>
    task.due === null ? 2 : isOverdue(task.due, timeZone, now) ? 0 : 1;
  const dayOf = (task: OpenTask) =>
    task.due === null ? 0 : getDueDay(task.due, timeZone);
  return [...tasks].sort(
    (left, right) =>
      rank(left) - rank(right) ||
      dayOf(left) - dayOf(right) ||
      right.createdAt - left.createdAt,
  );
}
