import { useEffect, useState } from 'react';

import type { Unsubscribe } from 'firebase/firestore';

import { useAuth } from '@/hooks/useAuth';
import { createSealedReader } from '@lib/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { startTopicVersionsListener } from '@apps/helm/store/listeners/topicListener';
import type { OpenTopicVersion } from '@apps/helm/types';

interface TopicVersions {
  /** Newest first; null until the first snapshot. */
  versions: OpenTopicVersion[] | null;
  hasFailed: boolean;
}

/** Listens to one topic's newest versions (every one by default) for as long as the caller is mounted; a null topic listens to nothing. */
export function useTopicVersions(
  topicId: string | null,
  max?: number,
): TopicVersions {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = `${topicId ?? ''}:${max ?? ''}`;
  const [state, setState] = useState<TopicVersions & { key: string }>({
    key,
    versions: null,
    hasFailed: false,
  });

  useEffect(() => {
    if (!uid || !topicId) return;
    const run = { isStopped: false, stop: null as Unsubscribe | null };
    const fail = (error: unknown) => {
      console.error('Helm topic history failed', error);
      if (!run.isStopped) setState({ key, versions: null, hasFailed: true });
    };
    getHelmEncryption(uid)
      .then((encryption) => {
        if (run.isStopped) return;
        run.stop = startTopicVersionsListener(
          uid,
          topicId,
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
  }, [uid, topicId, max, key]);

  return state.key === key ? state : { versions: null, hasFailed: false };
}
