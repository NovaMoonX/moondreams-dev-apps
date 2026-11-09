import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { ensureHelmProfile } from '@apps/helm/store/actions/settingsActions';
import { clearHelm, setProfile } from '@apps/helm/store/helmSlice';
import { startProfileListener } from '@apps/helm/store/listeners/profileListener';

/** Keeps the signed-in person's Helm profile in the store, and makes it the first time they open Helm. */
export function useHelmSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) return;

    let isCurrent = true;
    const stop = startProfileListener(
      uid,
      (profile) => {
        if (isCurrent) dispatch(setProfile({ uid, profile }));
      },
      (error) => console.error('Helm profile listener failed', error),
    );
    ensureHelmProfile(uid).catch((error: unknown) =>
      console.error('Helm profile was not created', error),
    );

    return () => {
      isCurrent = false;
      stop();
      dispatch(clearHelm());
    };
  }, [uid, dispatch]);
}
