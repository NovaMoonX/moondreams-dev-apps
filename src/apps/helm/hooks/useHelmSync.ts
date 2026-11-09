import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { createSealedReader } from '@lib/security';
import {
  clearHelmKey,
  getHelmEncryption,
} from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { ensureHelmProfile } from '@apps/helm/store/actions/settingsActions';
import {
  clearHelm,
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

    getHelmEncryption(uid)
      .then((encryption) => {
        if (!isCurrent) return;
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
      .catch((error: unknown) =>
        console.error('Helm could not get its key', error),
      );

    return () => {
      isCurrent = false;
      window.removeEventListener('online', ensure);
      stops.forEach((stop) => stop());
      clearHelmKey();
      dispatch(clearHelm());
    };
  }, [uid, dispatch]);
}
