import { useEffect, useState } from 'react';

import type { Unsubscribe } from 'firebase/firestore';

import { useAuth } from '@/hooks/useAuth';
import { createSealedReader } from '@lib/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { startRunListener } from '@apps/helm/store/listeners/runListener';
import type { OpenRun } from '@apps/helm/types';

interface RunState {
  run: OpenRun | null;
  /** Whether the first snapshot has arrived, so a run still loading is never mistaken for one that is gone. */
  isLoaded: boolean;
  isMissing: boolean;
  hasFailed: boolean;
}

const LOADING: RunState = {
  run: null,
  isLoaded: false,
  isMissing: false,
  hasFailed: false,
};

/** Listens to one run, finished or not, for as long as the caller is mounted; a null id listens to nothing. */
export function useRun(runId: string | null): RunState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<RunState & { key: string }>({
    ...LOADING,
    key: runId ?? '',
  });

  useEffect(() => {
    if (!uid || !runId) return;
    const key = runId;
    const run = { isStopped: false, stop: null as Unsubscribe | null };
    const fail = (error: unknown) => {
      console.error('Helm run failed', error);
      if (!run.isStopped) {
        setState({ ...LOADING, key, isLoaded: true, hasFailed: true });
      }
    };
    getHelmEncryption(uid)
      .then((encryption) => {
        if (run.isStopped) return;
        run.stop = startRunListener(
          uid,
          runId,
          createSealedReader(encryption, openJson),
          (opened, isMissing) =>
            setState({
              key,
              run: opened,
              isLoaded: true,
              isMissing,
              hasFailed: false,
            }),
          fail,
        );
      })
      .catch(fail);
    return () => {
      run.isStopped = true;
      run.stop?.();
    };
  }, [uid, runId]);

  return state.key === (runId ?? '') ? state : LOADING;
}
