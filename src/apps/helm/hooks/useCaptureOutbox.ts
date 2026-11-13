import { useEffect, useState, useSyncExternalStore } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { store, useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  canUseDropBox,
  flushOutbox,
  getOutboxEntries,
  loadOutbox,
  subscribeOutbox,
} from '@apps/helm/store/actions/outboxActions';

const RETRY_FIRST_MS = 15_000;
const RETRY_MAX_MS = 5 * 60 * 1000;

/** Brings what this device kept for the person into view and sends it once the connection is back, trying again with a growing pause while a send keeps failing. */
export function useCaptureOutbox(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const { addToast } = useToast();

  useEffect(() => {
    if (!uid) return;
    let isCurrent = true;
    let failures = 0;
    let timer: number | undefined;
    const flush = () => {
      window.clearTimeout(timer);
      flushOutbox(uid)
        .then(({ sent, rejected }) => {
          failures = 0;
          if (!isCurrent) return;
          if (rejected > 0) {
            addToast({
              title: HELM_COPY.outboxRejected(rejected),
              type: 'error',
            });
          }
          if (sent > 0 && store.getState().helm.keyStatus !== 'ready') {
            addToast({ title: HELM_COPY.outboxSentLocked, type: 'info' });
          }
        })
        .catch((error: unknown) => {
          console.error('Helm saved things were not sent', error);
          if (
            !isCurrent ||
            !navigator.onLine ||
            getOutboxEntries(uid).length === 0
          ) {
            return;
          }
          timer = window.setTimeout(
            flush,
            Math.min(RETRY_FIRST_MS * 2 ** failures, RETRY_MAX_MS),
          );
          failures += 1;
        });
    };
    loadOutbox(uid).then(flush, flush);
    window.addEventListener('online', flush);
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
      window.removeEventListener('online', flush);
    };
    // A key that arrives or fails is a moment to try again, since the server needs no key from the device.
  }, [uid, keyStatus, addToast]);
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
