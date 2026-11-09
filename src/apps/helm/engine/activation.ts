import { getDueDay } from '@apps/helm/utils/captureReading';
import type { OpenTask, TaskActivity } from '@apps/helm/types';

interface ActivityAt {
  now: number;
  timeZone: string;
}

/** Whether a task is awake: a not-until day still ahead, or a task or person it waits on that is still open, puts it to sleep. A waited task missing from `openIds` has ended. */
export function getTaskActivity(
  task: Pick<OpenTask, 'id' | 'notUntil' | 'waitsOnTaskIds' | 'waitsOnWhoId'>,
  openIds: ReadonlySet<string>,
  at: ActivityAt,
): TaskActivity {
  const today = getDueDay({ kind: 'moment', at: at.now }, at.timeZone);
  if (task.notUntil !== null && task.notUntil > today) {
    return { kind: 'notYet', until: task.notUntil };
  }
  const onTaskIds = task.waitsOnTaskIds.filter(
    (id) => id !== task.id && openIds.has(id),
  );
  if (onTaskIds.length > 0 || task.waitsOnWhoId !== null) {
    return { kind: 'waiting', onTaskIds, onWhoId: task.waitsOnWhoId };
  }
  return { kind: 'active' };
}

/** Splits open tasks into the awake ones and the ones asleep, each in the order given. */
export function splitByActivity(tasks: OpenTask[], at: ActivityAt) {
  const openIds = new Set(tasks.map((task) => task.id));
  const entries = tasks.map((task) => ({
    task,
    activity: getTaskActivity(task, openIds, at),
  }));
  return {
    active: entries
      .filter((entry) => entry.activity.kind === 'active')
      .map((entry) => entry.task),
    latent: entries.filter((entry) => entry.activity.kind !== 'active'),
    byId: new Map(entries.map((entry) => [entry.task.id, entry.activity])),
  };
}
