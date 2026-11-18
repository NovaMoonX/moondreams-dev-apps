import { useEffect, useState } from 'react';

import { createSealedReader } from '@lib/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { fetchTasksById } from '@apps/helm/store/listeners/taskListener';
import type { OpenTask } from '@apps/helm/types';

/** Tasks the open list doesn't hold (done since), read once by id; empty until they arrive and for any that is gone. */
export function useFetchedTasks(uid: string | null, ids: string[]) {
  const key = ids.join(',');
  const [fetched, setFetched] = useState<{
    key: string;
    tasks: OpenTask[];
  } | null>(null);

  useEffect(() => {
    if (!uid || key === '') return;
    let isCurrent = true;
    getHelmEncryption(uid)
      .then((encryption) =>
        fetchTasksById(
          uid,
          createSealedReader(encryption, openJson),
          key.split(','),
        ),
      )
      .then((tasks) => {
        if (isCurrent) setFetched({ key, tasks });
      })
      .catch((error: unknown) =>
        console.error('Helm earlier tasks did not open', error),
      );
    return () => {
      isCurrent = false;
    };
  }, [uid, key]);

  return fetched?.key === key ? fetched.tasks : [];
}
