import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { queryClient } from '@lib/query/queryClient';

import { normalizeRunwayEncryption } from '@apps/runway/security';

export const runwayQueryKeys = {
  all: ['runway'] as const,
  key: (uid: string) => [...runwayQueryKeys.all, 'key', uid] as const,
};

const getRunwayKeyCallable = httpsCallable<Record<string, never>, unknown>(
  functions,
  'getRunwayKey',
);

/** Held in memory for the session and never persisted: no `persist` meta, and the cache is cleared on sign-out. */
export function runwayKeyQueryOptions(uid: string) {
  return queryOptions({
    queryKey: runwayQueryKeys.key(uid),
    queryFn: async () => {
      const response = await getRunwayKeyCallable({});
      const encryption = normalizeRunwayEncryption(response.data);
      if (!encryption) {
        throw new Error('The plan key did not arrive in the expected shape.');
      }
      return encryption;
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function getRunwayEncryption(uid: string) {
  return queryClient.fetchQuery(runwayKeyQueryOptions(uid));
}
