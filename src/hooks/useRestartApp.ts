import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { hasUnsavedWork } from '@lib/app/unsavedWork';

/** Reloads the page to load a new version (or runs `reload` in its place), first asking whether to throw away a form's typed work when one holds some; `onProceed` runs only once it is going ahead. */
export function useRestartApp(
  onProceed?: () => void,
  reload: () => void | Promise<void> = () => window.location.reload(),
) {
  const { confirm } = useActionModal();

  const restart = async () => {
    if (hasUnsavedWork()) {
      const isConfirmed = await confirm({
        title: 'Restart and lose what you typed?',
        message:
          'Finish and save it first, then restart. Restarting now throws it away.',
        confirmText: 'Restart anyway',
        cancelText: 'Keep editing',
        destructive: true,
      });
      if (!isConfirmed) return;
    }
    onProceed?.();
    await reload();
  };

  const result = () => {
    void restart();
  };
  return result;
}
