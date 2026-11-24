import { useRef } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { HELM_COPY } from '@apps/helm/constants';
import type {
  ScheduledCreateRefusal,
  ScheduledWrite,
} from '@apps/helm/store/actions/scheduledActionWrites';
import { UNDO_WINDOW_MS } from '@/lib/undo';

type Refusal = ScheduledWrite extends infer Write
  ? Write extends { refused: infer Reason }
    ? Reason
    : never
  : never;

type Written = Exclude<ScheduledWrite, { refused: unknown }>;

type Write = Written | { refused: Refusal | ScheduledCreateRefusal };

/** The sentence for a change the engine refused. */
export const readRefusal = (reason: Refusal | ScheduledCreateRefusal) =>
  HELM_COPY.scheduledRefusal[reason];

/** Shows what a scheduled-action write did: a refusal says why, a failed write says so, a good one gets its toast with Undo, replacing the last one so an older Undo never undoes a newer change. The write is never awaited, so a change works offline. */
export function useScheduledChange() {
  const { addToast, removeToast } = useToast();
  const undoToastId = useRef<string | null>(null);

  const guard = (write: Write): Written | null => {
    if ('refused' in write) {
      addToast({ title: readRefusal(write.refused), type: 'info' });
      return null;
    }
    write.written.catch((error: unknown) => {
      console.error('Helm scheduled action was not changed', error);
      addToast({ title: HELM_COPY.scheduledSaveFailed, type: 'error' });
    });
    return write;
  };

  const undoOf = (write: { undo: () => Promise<'undone' | 'kept'> }) => () =>
    void write
      .undo()
      .then((outcome) => {
        if (outcome === 'kept')
          addToast({ title: HELM_COPY.scheduledUndoKept, type: 'info' });
      })
      .catch((error: unknown) => {
        console.error('Helm scheduled action was not put back', error);
        addToast({ title: HELM_COPY.scheduledUndoFailed, type: 'error' });
      });

  /** Whether the write was accepted. */
  const report = (write: Write, message: string) => {
    const kept = guard(write);
    if (!kept) return false;
    if (undoToastId.current) removeToast(undoToastId.current);
    undoToastId.current = addToast({
      duration: UNDO_WINDOW_MS,
      title:
        kept.dropped > 0
          ? `${message} ${HELM_COPY.scheduledDropped(kept.dropped)}`
          : message,
      type: 'success',
      action: { label: HELM_COPY.undo, onClick: undoOf(kept) },
    });
    return true;
  };

  return { guard, undoOf, report, toast: addToast };
}
