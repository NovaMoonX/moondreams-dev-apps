import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { queryClient } from '@lib/query/queryClient';

import { normalizeHelmEncryption } from '@apps/helm/security';

export const helmQueryKeys = {
  all: ['helm'] as const,
  key: (uid: string) => [...helmQueryKeys.all, 'key', uid] as const,
};

const getHelmKeyCallable = httpsCallable<{ deviceId: null }, unknown>(
  functions,
  'getHelmKey',
);

/** The data key, held in memory for the session only: never persisted, never refetched on its own. */
export const helmKeyQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: helmQueryKeys.key(uid),
    queryFn: async () => {
      const response = await getHelmKeyCallable({ deviceId: null });
      const encryption = normalizeHelmEncryption(response.data);
      if (!encryption) {
        throw new Error('The key did not arrive in the expected shape.');
      }
      return encryption;
    },
    staleTime: Infinity,
    retry: false,
  });

export const getHelmEncryption = (uid: string) =>
  queryClient.fetchQuery(helmKeyQueryOptions(uid));

// Cancelling first discards a read still in flight, so nothing it opened lands after the key is gone.
export const clearHelmKey = () => {
  void queryClient.cancelQueries({ queryKey: helmQueryKeys.all });
  queryClient.removeQueries({ queryKey: helmQueryKeys.all });
};
