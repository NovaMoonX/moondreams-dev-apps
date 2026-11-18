import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import {
  readContactsFailure,
  type ContactsImportResult,
} from '@apps/helm/queries/contactsQueries';
import { takeBack } from '@apps/helm/store/actions/undoActions';

/** Says what an import did, with an Undo on the toast, and what a failed one means. */
export function useContactsReport() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const undo = (executionId: string) => {
    if (!user) return;
    takeBack(user.uid, executionId)
      .then((result) => {
        if (result.kind === 'refused')
          addToast({
            title: result.report ?? HELM_COPY.cannotTakeBack,
            type: 'error',
          });
        if (result.kind === 'offline')
          addToast({
            title: HELM_COPY.undoNeedsConnectionTitle,
            description: HELM_COPY.undoNeedsConnectionBody,
            type: 'error',
          });
      })
      .catch((error: unknown) => {
        console.error('Helm contacts undo failed', error);
        addToast({ title: HELM_COPY.undoFailed, type: 'error' });
      });
  };

  const reportDone = (result: ContactsImportResult, upToDate: string) => {
    if (result.executionId === null) {
      addToast({ title: upToDate, type: 'info' });
      return;
    }
    const { executionId } = result;
    addToast({
      title: result.summary ?? HELM_COPY.contactsBringIn,
      type: 'success',
      action: { label: HELM_COPY.undo, onClick: () => undo(executionId) },
    });
  };

  /** The line for a failed call, or null when the reason is that Google must be connected again. */
  const toFailureLine = (error: unknown, fallback: string) => {
    const reason = readContactsFailure(error);
    if (reason === 'goneAtGoogle') return HELM_COPY.contactsGoneAtGoogle;
    if (reason === 'reconnect' || reason === 'notConnected') return null;
    return (error as { code?: string } | null)?.code === 'functions/aborted'
      ? HELM_COPY.contactsChanged
      : fallback;
  };

  return { reportDone, toFailureLine };
}
