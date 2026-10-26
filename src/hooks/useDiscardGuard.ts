import { useRef } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

interface UseDiscardGuardOptions {
  /** The form holds something the person typed or chose since it opened. */
  isDirty: boolean;
  onClose: () => void;
  /** A save in flight: leaving waits for it. */
  isBusy?: boolean;
  title?: string;
  message?: string;
}

/** The one way out of a form holding typed work: asks Keep editing / Discard once, and leaves at once when nothing was typed. Pass it to every route out (the close button, Escape, the back gesture, Cancel). */
export function useDiscardGuard({
  isDirty,
  onClose,
  isBusy = false,
  title = 'Discard what you typed?',
  message = 'It will not be saved.',
}: UseDiscardGuardOptions) {
  const { confirm } = useActionModal();
  const isAskingRef = useRef(false);

  const requestClose = async () => {
    if (isBusy || isAskingRef.current) return;
    if (!isDirty) {
      onClose();
      return;
    }
    isAskingRef.current = true;
    const isDiscarded = await confirm({
      title,
      message,
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      destructive: true,
    });
    isAskingRef.current = false;
    if (isDiscarded) onClose();
  };

  const result = () => {
    void requestClose();
  };
  return result;
}
