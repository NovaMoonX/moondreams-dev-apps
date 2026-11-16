import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import {
  setQuiet,
  type QuietKind,
} from '@apps/helm/store/actions/privacyActions';

/** Writes one thing's quiet state and says what happened: a toast with Undo on success, the refusal's own line, or why it did not save. Answers whether it saved. */
export function useQuietWrite(
  kind: QuietKind,
  id: string,
  inheritedFrom: string | null,
) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isWriting, setIsWriting] = useState(false);

  const write = async (
    isQuiet: boolean,
    until: string | null,
    toastTitle: string,
  ) => {
    if (!user || isWriting) return false;
    setIsWriting(true);
    try {
      const result = await setQuiet(user.uid, kind, id, isQuiet, until);
      if (result.kind === 'refused') {
        addToast({
          title: inheritedFrom
            ? HELM_COPY.quietFromParent(inheritedFrom)
            : result.line,
          type: 'info',
        });
        return false;
      }
      if (result.kind === 'offline') {
        addToast({ title: HELM_COPY.privateNeedsConnection, type: 'info' });
        return false;
      }
      if (result.kind === 'saved') {
        addToast({
          title: toastTitle,
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void result.undo().catch((error: unknown) => {
                console.error('Helm quiet change was not put back', error);
                addToast({ title: HELM_COPY.quietFailed, type: 'error' });
              }),
          },
        });
        return true;
      }
      if (result.kind !== 'unchanged')
        addToast({ title: HELM_COPY.quietFailed, type: 'error' });
      return false;
    } catch (error) {
      console.error('Helm quiet switch did not save', error);
      addToast({ title: HELM_COPY.quietFailed, type: 'error' });
      return false;
    } finally {
      setIsWriting(false);
    }
  };

  return { write, isWriting };
}
