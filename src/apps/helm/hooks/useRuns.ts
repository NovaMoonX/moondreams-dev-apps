import { useEffect, useState } from 'react';

import type { Unsubscribe } from 'firebase/firestore';

import { useAuth } from '@/hooks/useAuth';
import { createSealedReader } from '@lib/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { startRunsListener } from '@apps/helm/store/listeners/runListener';
import type { OpenRun } from '@apps/helm/types';

interface Runs {
  /** Newest first; null until the first snapshot. */
  runs: OpenRun[] | null;
  hasFailed: boolean;
}

/** Listens to one procedure's or one thing's newest runs for as long as the caller is mounted; a null id listens to nothing. */
export function useRuns(
  field: 'procedureId' | 'attachedTo.id',
  id: string | null,
  max: number,
): Runs {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = `${field}:${id ?? ''}:${max}`;
  const [state, setState] = useState<Runs & { key: string }>({
    key,
    runs: null,
    hasFailed: false,
  });

  useEffect(() => {
    if (!uid || !id) return;
    const run = { isStopped: false, stop: null as Unsubscribe | null };
    const fail = (error: unknown) => {
      console.error('Helm runs failed', error);
      if (!run.isStopped) setState({ key, runs: null, hasFailed: true });
    };
    getHelmEncryption(uid)
      .then((encryption) => {
        if (run.isStopped) return;
        run.stop = startRunsListener(
          uid,
          field,
          id,
          createSealedReader(encryption, openJson),
          (runs) => setState({ key, runs, hasFailed: false }),
          fail,
          max,
        );
      })
      .catch(fail);
    return () => {
      run.isStopped = true;
      run.stop?.();
    };
  }, [uid, field, id, max, key]);

  return state.key === key ? state : { runs: null, hasFailed: false };
}
