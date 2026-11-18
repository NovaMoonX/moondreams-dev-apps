import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { HELM_COPY } from '@apps/helm/constants';

interface HabitChange {
  written: Promise<void>;
  undo: () => Promise<'undone' | 'kept'>;
}

/** Shows a habit change's toast with its Undo, and says plainly when the write failed or Undo found the habit changed since. The write is never awaited, so it works offline. */
export function useHabitChange() {
  const { addToast } = useToast();
  return (change: HabitChange, toast: string, failure: string) => {
    change.written.catch((error: unknown) => {
      console.error('Helm habit was not changed', error);
      addToast({ title: failure, type: 'error' });
    });
    addToast({
      title: toast,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void change
            .undo()
            .then((outcome) => {
              if (outcome === 'kept')
                addToast({ title: HELM_COPY.habitUndoKept, type: 'info' });
            })
            .catch((error: unknown) => {
              console.error('Helm habit was not put back', error);
              addToast({ title: HELM_COPY.habitUndoFailed, type: 'error' });
            }),
      },
    });
  };
}
