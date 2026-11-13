import { useEffect, useState } from 'react';

import type { Unsubscribe } from 'firebase/firestore';

import { useAuth } from '@/hooks/useAuth';
import { createSealedReader } from '@lib/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { startProcedureVersionsListener } from '@apps/helm/store/listeners/procedureListener';
import type { OpenProcedureVersion } from '@apps/helm/types';

interface ProcedureVersions {
  /** Newest first; null until the first snapshot. */
  versions: OpenProcedureVersion[] | null;
  hasFailed: boolean;
}

/** Listens to one procedure's newest versions (every one by default) for as long as the caller is mounted; a null procedure listens to nothing. */
export function useProcedureVersions(
  procedureId: string | null,
  max?: number,
): ProcedureVersions {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = `${procedureId ?? ''}:${max ?? ''}`;
  const [state, setState] = useState<ProcedureVersions & { key: string }>({
    key,
    versions: null,
    hasFailed: false,
  });

  useEffect(() => {
    if (!uid || !procedureId) return;
    const run = { isStopped: false, stop: null as Unsubscribe | null };
    const fail = (error: unknown) => {
      console.error('Helm procedure history failed', error);
      if (!run.isStopped) setState({ key, versions: null, hasFailed: true });
    };
    getHelmEncryption(uid)
      .then((encryption) => {
        if (run.isStopped) return;
        run.stop = startProcedureVersionsListener(
          uid,
          procedureId,
          createSealedReader(encryption, openJson),
          (versions) => setState({ key, versions, hasFailed: false }),
          fail,
          max,
        );
      })
      .catch(fail);
    return () => {
      run.isStopped = true;
      run.stop?.();
    };
  }, [uid, procedureId, max, key]);

  return state.key === key ? state : { versions: null, hasFailed: false };
}
