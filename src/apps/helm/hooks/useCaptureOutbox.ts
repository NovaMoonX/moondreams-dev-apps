import { useEffect, useState, useSyncExternalStore } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { registerSignOutCheck } from '@/lib/auth/signOutChecks';
import { store, useAppSelector } from '@/store';
import { DEFAULT_ASSISTANT_NAME, HELM_COPY } from '@apps/helm/constants';
import {
  canUseDropBox,
  countOutbox,
  flushOutbox,
  getOutboxEntries,
  loadOutbox,
  subscribeOutbox,
} from '@apps/helm/store/actions/outboxActions';
import { readAssistantName } from '@apps/helm/utils/assistantName';

/** Brings what this device kept for the person into view, sends it once Helm is online and asks before sign-out would lose it. */
export function useCaptureOutbox(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const { addToast } = useToast();

  useEffect(() => {
    if (!uid) return;
    let isCurrent = true;
    const flush = () => {
      flushOutbox(uid)
        .then((rejected) => {
          if (isCurrent && rejected > 0) {
            addToast({
              title: HELM_COPY.outboxRejected(rejected),
              type: 'error',
            });
          }
        })
        .catch((error: unknown) =>
          console.error('Helm saved things were not sent', error),
        );
    };
    loadOutbox(uid).then(flush, flush);
    window.addEventListener('online', flush);
    return () => {
      isCurrent = false;
      window.removeEventListener('online', flush);
    };
    // A key that arrives or fails is a moment to try again, since the server needs no key from the device.
  }, [uid, keyStatus, addToast]);

  useEffect(() => {
    if (!uid) return;
    return registerSignOutCheck(async (signingOutUid) => {
      const count = signingOutUid === uid ? await countOutbox(uid) : 0;
      if (count === 0) return null;
      const name =
        readAssistantName(store.getState().helm.profile?.assistantName) ??
        DEFAULT_ASSISTANT_NAME;
      return {
        title: HELM_COPY.outboxSignOutTitle,
        message: HELM_COPY.outboxSignOutBody(count, name),
        confirmText: HELM_COPY.outboxSignOutConfirm,
        cancelText: HELM_COPY.outboxStay,
      };
    });
  }, [uid]);
}

/** The saved things this device holds for the person, oldest first. */
export function useOutboxEntries(uid: string | null) {
  return useSyncExternalStore(subscribeOutbox, () => getOutboxEntries(uid));
}

/** Whether a capture can be kept sealed on this device with no key; settled again whenever the key's state changes. */
export function useCanUseDropBox(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const [answer, setAnswer] = useState<{ uid: string; can: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!uid || keyStatus === 'ready') return;
    let isCurrent = true;
    canUseDropBox(uid)
      .catch(() => false)
      .then((can) => {
        if (isCurrent) setAnswer({ uid, can });
      });
    return () => {
      isCurrent = false;
    };
  }, [uid, keyStatus]);

  return answer?.uid === uid && answer.can;
}
