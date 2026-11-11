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

/** What the turn's executions kept this photo on: the record's name (null when the effect named none or kept it on nothing); null when none of them kept it. */
export const getKeptEffect = (
  executions: OpenExecution[],
  mediaId: string,
): { title: string | null } | null =>
  executions
    .filter(
      (execution) =>
        execution.state === 'succeeded' && execution.category !== 'undo',
    )
    .flatMap((execution) =>
      execution.effectRefs.flatMap((ref, index) => {
        const written = execution.effects[index]?.written;
        if (
          ref.collection !== 'media' ||
          ref.docId !== mediaId ||
          written?.status !== 'kept'
        ) {
          return [];
        }
        const hasRecord =
          Array.isArray(written.attachedTo) && written.attachedTo.length > 0;
        return [{ title: hasRecord ? toText(written['sealed.title']) : null }];
      }),
    )[0] ?? null;
