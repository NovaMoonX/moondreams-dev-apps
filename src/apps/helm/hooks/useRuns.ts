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
  const scope = `${field}:${id ?? ''}`;
  const [state, setState] = useState<Runs & { scope: string }>({
    scope,
    runs: null,
    hasFailed: false,
  });

  useEffect(() => {
    if (!uid || !id) return;
    const run = { isStopped: false, stop: null as Unsubscribe | null };
    const fail = (error: unknown) => {
      if (run.isStopped) return;
      console.error('Helm runs failed', error);
      setState({ scope, runs: null, hasFailed: true });
    };
    getHelmEncryption(uid)
      .then((encryption) => {
        if (run.isStopped) return;
        run.stop = startRunsListener(
          uid,
          field,
          id,
          createSealedReader(encryption, openJson),
          (runs) => setState({ scope, runs, hasFailed: false }),
          fail,
          max,
        );
      })
      .catch(fail);
    return () => {
      run.isStopped = true;
      run.stop?.();
    };
  }, [uid, field, id, max, scope]);

  return state.scope === scope ? state : { runs: null, hasFailed: false };
}
