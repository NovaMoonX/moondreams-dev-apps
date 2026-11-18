import { queryOptions } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { createSealedReader } from '@lib/security';

import {
  getHelmEncryption,
  helmQueryKeys,
} from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { openTask } from '@apps/helm/store/listeners/taskListener';

/** Every done task, opened on the device and held for the session only (dropped with the data key, never persisted); read again each time Search opens, so a task done since is found. */
export const doneTasksQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: [...helmQueryKeys.all, 'doneTasks', uid] as const,
    queryFn: async () => {
      const read = createSealedReader(await getHelmEncryption(uid), openJson);
      const snapshot = await getDocs(
        query(
          collection(db, 'apps', 'helm', 'users', uid, 'tasks'),
          where('status', '==', 'done'),
        ),
      );
      return Promise.all(snapshot.docs.map((entry) => openTask(entry, read)));
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: 'always',
    retry: false,
  });
