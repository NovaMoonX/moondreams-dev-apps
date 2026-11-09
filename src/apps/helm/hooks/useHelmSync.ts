import { useEffect } from 'react';

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
  setProfile,
  setRecentCaptures,
  setRecentCapturesFailed,
  setUnseenCaptures,
  setUnseenCapturesFailed,
} from '@apps/helm/store/helmSlice';
import {
  startRecentCapturesListener,
  startUnseenCapturesListener,
} from '@apps/helm/store/listeners/captureListener';
import { startProfileListener } from '@apps/helm/store/listeners/profileListener';
import { getRecentWindowStart } from '@apps/helm/utils/sessions';

const OFFLINE_CODES = ['functions/unavailable', 'functions/deadline-exceeded'];

const isOfflineError = (error: unknown) =>
  !navigator.onLine ||
  (error instanceof Error &&
    'code' in error &&
    OFFLINE_CODES.includes(String(error.code)));

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
        );
      })
      .catch((error: unknown) => {
        // A cleanup that clears the key cancels its fetch; that is not a failure.
        if (!isCurrent) return;
        console.error('Helm could not get its key', error);
        const isOffline = isOfflineError(error);
        dispatch(setKeyStatus(isOffline ? 'offline' : 'failed'));
        if (isOffline) window.addEventListener('online', retryOnline);
      });

    return () => {
      isCurrent = false;
      window.removeEventListener('online', retryOnline);
      stops.forEach((stop) => stop());
      clearHelmKey();
    };
  }, [uid, keyAttempt, dispatch]);
}
