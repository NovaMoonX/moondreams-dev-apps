import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { hasUnsavedWork } from '@lib/app/unsavedWork';

/** Reloads the page to load a new version, first asking whether to throw away a form's typed work when one holds some. */
export function useRestartApp() {
  const { confirm } = useActionModal();

  const restart = async () => {
    if (hasUnsavedWork()) {
      const isConfirmed = await confirm({
        title: 'Restart and lose what you typed?',
        message: 'Save what you are working on first, then restart. The new version will wait.',
        confirmText: 'Restart anyway',
        cancelText: 'Keep editing',
        destructive: true,
      });
      if (!isConfirmed) return;
    }
    window.location.reload();
  };

  const result = () => {
    void restart();
  };
  return result;
}
