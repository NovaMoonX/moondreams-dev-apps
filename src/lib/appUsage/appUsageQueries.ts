import { queryOptions } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import type { AppUsage } from './appUsage';

export const appUsageQueryKeys = {
  all: ['appUsage'] as const,
  forApp: (appId: string) => [...appUsageQueryKeys.all, appId] as const,
};

/** Every member's usage record for one app. Admin-only: the rules refuse anyone else. */
export function appUsageQueryOptions(appId: string) {
  return queryOptions({
    queryKey: appUsageQueryKeys.forApp(appId),
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'apps', appId, 'usage'));
      const result = snapshot.docs.map((docSnap) => docSnap.data() as AppUsage);
      return result;
    },
    staleTime: 60_000,
  });
}
