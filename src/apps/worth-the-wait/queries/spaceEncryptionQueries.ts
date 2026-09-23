import { queryOptions } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { queryClient } from '@lib/query/queryClient';

import { normalizeSpaceEncryption } from '../security';

export const worthTheWaitQueryKeys = {
  all: ['worth-the-wait'] as const,
  spaceEncryption: (spaceId: string) =>
    [...worthTheWaitQueryKeys.all, 'spaceEncryption', spaceId] as const,
};

/** A space's key is written once at creation and never rotated, so it's cached for the session. */
export function spaceEncryptionQueryOptions(spaceId: string) {
  return queryOptions({
    queryKey: worthTheWaitQueryKeys.spaceEncryption(spaceId),
    queryFn: async () => {
      const snapshot = await getDoc(doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId));
      return normalizeSpaceEncryption(snapshot.data()?.encryption ?? null);
    },
    staleTime: Infinity,
    // Key material: Firestore's own offline cache already covers it, so skip a second on-disk copy.
    meta: { persist: false },
  });
}

export function getSpaceEncryption(spaceId: string) {
  return queryClient.fetchQuery(spaceEncryptionQueryOptions(spaceId));
}
