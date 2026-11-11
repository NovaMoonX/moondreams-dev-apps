import { HELM_COPY } from '@apps/helm/constants';
import type { MediaAttachment, OpenExecution } from '@apps/helm/types';

export interface KeepTarget {
  attachment: MediaAttachment;
  title: string;
}

const toText = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** The first task or fact a turn's executions changed, which a photo it let go is kept on; null when they changed neither. */
export const getKeepTarget = (executions: OpenExecution[]): KeepTarget | null =>
  executions
    .filter(
      (execution) =>
        execution.state === 'succeeded' &&
        execution.category !== 'undo' &&
        execution.undoneByExecutionId === null,
    )
    .flatMap((execution) =>
      execution.effectRefs.flatMap((ref, index): KeepTarget[] => {
        if (ref.collection !== 'tasks' && ref.collection !== 'facts') return [];
        const effect = execution.effects[index];
        const isTask = ref.collection === 'tasks';
        return [
          {
            attachment: { kind: isTask ? 'task' : 'fact', id: ref.docId },
            title:
              (isTask
                ? (toText(effect?.written['sealed.title']) ??
                  toText(effect?.previous?.['sealed.title']))
                : (toText(effect?.written['sealed.statement']) ??
                  toText(effect?.written['sealed.title']))) ??
              (isTask
                ? HELM_COPY.resultTaskFallback
                : HELM_COPY.resultFactFallback),
          },
        ];
      }),
    )[0] ?? null;
