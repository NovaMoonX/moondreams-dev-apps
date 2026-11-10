import { HELM_COPY } from '@apps/helm/constants';
import type { OpenExecution, OpenTask } from '@apps/helm/types';
import { formatTaskDue, toTaskDue } from '@apps/helm/utils/taskDue';

export interface ResultLine {
  key: string;
  title: string;
  detail: string | null;
}

const toText = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** One line per effect, from what the execution sealed, so a task that has since left the open list still shows. A field the effect didn't write (a task marked done keeps its title) comes from the open task when it is there. */
export function buildResultLines(
  execution: OpenExecution,
  tasksById: Map<string, OpenTask>,
  timeZone: string,
  now: number,
): ResultLine[] {
  return execution.effectRefs.map((ref, index) => {
    const effect = execution.effects[index];
    const task = tasksById.get(ref.docId);
    const title =
      toText(effect?.written['sealed.title']) ??
      toText(effect?.previous?.['sealed.title']) ??
      toText(task?.title) ??
      HELM_COPY.resultTaskFallback;
    if (ref.collection === 'facts') {
      return {
        key: `${ref.docId}:${index}`,
        title:
          toText(effect?.written['sealed.title']) ??
          toText(effect?.written['sealed.statement']) ??
          HELM_COPY.resultFactFallback,
        detail: null,
      };
    }
    const isDone = effect?.written.status === 'done';
    const due =
      effect && 'due' in effect.written
        ? toTaskDue(effect.written.due)
        : (task?.due ?? null);
    const detail = isDone
      ? HELM_COPY.resultDone
      : due
        ? HELM_COPY.resultTaskDue(formatTaskDue(due, timeZone, now))
        : null;
    return { key: `${ref.docId}:${index}`, title, detail };
  });
}
