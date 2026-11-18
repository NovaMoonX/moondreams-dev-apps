// Generated from src/apps/helm/engine/needsYou.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** The one rule for whether another app's task copy asks for the person on a day. Pure and import-free: the server keeps a copy (`check:server-copies`). */

/** The facts a task copy carries that decide it; `extra` holds only the contract's task keys. */
export interface NeedsYouTask {
  kind: string;
  dueAt: number | null;
  extra: Record<string, string | number | boolean | null>;
}

/** The person's calendar day at `at` as UTC midnight, the form a date-only due day is stored in. */
export const toPersonDay = (at: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(at));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read('year'), read('month') - 1, read('day'));
};

/** A task that is neither finished or paid nor handled by its source (autopay). */
export const isOpenTask = (task: Pick<NeedsYouTask, 'kind' | 'extra'>) =>
  task.kind === 'task' &&
  task.extra.isDone !== true &&
  task.extra.isAutomatic !== true;

/** Whether an open task asks for the person on `day` (UTC midnight): due that day or overdue. A task with no due day is a list the person keeps. A due day ahead never asks yet. */
export const needsYouOnDay = (task: NeedsYouTask, day: number) =>
  isOpenTask(task) && (task.dueAt === null || task.dueAt <= day);
