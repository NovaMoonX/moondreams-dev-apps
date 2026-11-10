import { useEffect, useRef } from 'react';

import { syncConnections } from '@/lib/connections/connectionCalls';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppDispatch, useAppSelector } from '@/store';
import { unlockSealedFormDrafts } from '@lib/app/formDrafts';
import { createSealedReader } from '@lib/security';
import {
  clearHelmKey,
  getHelmEncryption,
} from '@apps/helm/queries/helmKeyQueries';
import {
  createDraftSealer,
  HELM_DRAFT_PREFIX,
  openJson,
} from '@apps/helm/security';
import { ensureHelmProfile } from '@apps/helm/store/actions/settingsActions';
import {
  clearHelm,
  retryKey,
  setKeyStatus,
  setOpenTasks,
  setOpenTasksFailed,
  setProfile,
  setRecentCaptures,
  setRecentCapturesFailed,
  setRecentExecutions,
  setRecentExecutionsFailed,
  setSynced,
  setSyncedFailed,
  setUnseenCaptures,
  setUnseenCapturesFailed,
  setWaitingCaptures,
  setWaitingCapturesFailed,
} from '@apps/helm/store/helmSlice';
import {
  startRecentCapturesListener,
  startUnseenCapturesListener,
  startWaitingCapturesListener,
} from '@apps/helm/store/listeners/captureListener';
import { startRecentExecutionsListener } from '@apps/helm/store/listeners/executionListener';
import { startSyncedListener } from '@apps/helm/store/listeners/syncedListener';
import { startProfileListener } from '@apps/helm/store/listeners/profileListener';
import { startOpenTasksListener } from '@apps/helm/store/listeners/taskListener';
import { useCaptureSweep } from '@apps/helm/hooks/useCaptureSweep';
import { SYNC_REFRESH_MS } from '@apps/helm/constants';
import { getRecentWindowStart } from '@apps/helm/utils/sessions';
import { isDueForRefresh } from '@apps/helm/utils/synced';

const OFFLINE_CODES = ['functions/unavailable', 'functions/deadline-exceeded'];

const isOfflineError = (error: unknown) =>
  !navigator.onLine ||
  (error instanceof Error &&
    'code' in error &&
    OFFLINE_CODES.includes(String(error.code)));

/** Asks the platform to update the connections that are due, on open and on coming back to the tab, at most once per window; never offline. */
function useConnectionsRefresh(uid: string | null) {
  const { grants, isKnown } = useConnections({ readerAppId: 'helm' });
  const lastAskedAt = useRef(0);
  const isAsking = useRef(false);

  useEffect(() => {
    if (!uid || !isKnown) return;
    const ask = () => {
      const now = Date.now();
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine ||
        isAsking.current ||
        now - lastAskedAt.current < SYNC_REFRESH_MS ||
        !grants.some((grant) => isDueForRefresh(grant, now))
      )
        return;
      isAsking.current = true;
      syncConnections({})
        .then(() => {
          lastAskedAt.current = now;
        })
        .catch((error: unknown) =>
          console.error('Helm connections were not updated', error),
        )
        .finally(() => {
          isAsking.current = false;
        });
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    window.addEventListener('online', ask);
    return () => {
      document.removeEventListener('visibilitychange', ask);
      window.removeEventListener('online', ask);
    };
  }, [uid, isKnown, grants]);
}

/** Keeps the signed-in person's Helm profile in the store and makes it the first time they open Helm; once the data key is here, keeps their turns there too. */
export function useHelmSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) return;

    let isCurrent = true;
    const stops: (() => void)[] = [];
    stops.push(
      startProfileListener(
        uid,
        (profile) => {
          if (isCurrent) dispatch(setProfile({ uid, profile }));
        },
        (error) => console.error('Helm profile listener failed', error),
      ),
    );
    const ensure = () =>
      ensureHelmProfile(uid).catch((error: unknown) =>
        console.error('Helm profile was not created', error),
      );
    ensure();
    // A first open made offline has its transaction refused; it is tried again once the device is back online.
    window.addEventListener('online', ensure);

    return () => {
      isCurrent = false;
      window.removeEventListener('online', ensure);
      stops.forEach((stop) => stop());
      dispatch(clearHelm());
    };
  }, [uid, dispatch]);

  useCaptureSweep(uid);
  useConnectionsRefresh(uid);

  const keyAttempt = useAppSelector((state) => state.helm.keyAttempt);

  useEffect(() => {
    if (!uid) return;

    let isCurrent = true;
    const stops: (() => void)[] = [];
    const retryOnline = () => dispatch(retryKey());

    getHelmEncryption(uid)
      .then(async (encryption) => {
        if (!isCurrent) return;
        // Drafts open before the field mounts, so what was typed is there when it does.
        await unlockSealedFormDrafts(
          uid,
          HELM_DRAFT_PREFIX,
          createDraftSealer(encryption),
        );
        if (!isCurrent) return;
        dispatch(setKeyStatus('ready'));
        const read = createSealedReader(encryption, openJson);
        stops.push(
          startRecentCapturesListener(
            uid,
            read,
            getRecentWindowStart(Date.now()),
            (captures) => dispatch(setRecentCaptures(captures)),
            (error) => {
              console.error('Helm turns listener failed', error);
              dispatch(setRecentCapturesFailed());
            },
          ),
          startUnseenCapturesListener(
            uid,
            read,
            (captures) => dispatch(setUnseenCaptures(captures)),
            (error) => {
              console.error('Helm unseen turns listener failed', error);
              dispatch(setUnseenCapturesFailed());
            },
          ),
          startWaitingCapturesListener(
            uid,
            read,
            (captures) => dispatch(setWaitingCaptures(captures)),
            (error) => {
              console.error('Helm waiting turns listener failed', error);
              dispatch(setWaitingCapturesFailed());
            },
          ),
          startOpenTasksListener(
            uid,
            read,
            (tasks) => dispatch(setOpenTasks(tasks)),
            (error) => {
              console.error('Helm tasks listener failed', error);
              dispatch(setOpenTasksFailed());
            },
          ),
          startSyncedListener(
            uid,
            read,
            (records) => dispatch(setSynced(records)),
            (error) => {
              console.error('Helm synced things listener failed', error);
              dispatch(setSyncedFailed());
            },
          ),
          startRecentExecutionsListener(
            uid,
            read,
            getRecentWindowStart(Date.now()),
            (executions) => dispatch(setRecentExecutions(executions)),
            (error) => {
              console.error('Helm activity listener failed', error);
              dispatch(setRecentExecutionsFailed());
            },
          ),
        );
      })
      .catch((error: unknown) => {
        // A cleanup that clears the key cancels its fetch; that is not a failure.
        if (!isCurrent) return;
        console.error('Helm could not get its key', error);
        dispatch(setKeyStatus(isOfflineError(error) ? 'offline' : 'failed'));
        // A dropped connection can read as a server failure, so both ask again once the device is back online.
        window.addEventListener('online', retryOnline);
      });

    return () => {
      isCurrent = false;
      window.removeEventListener('online', retryOnline);
      stops.forEach((stop) => stop());
      clearHelmKey();
    };
  }, [uid, keyAttempt, dispatch]);
}
