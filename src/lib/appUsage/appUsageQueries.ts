import { queryOptions } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import type { AppUsage, SiteVisit } from './appUsage';

export const appUsageQueryKeys = {
  all: ['appUsage'] as const,
  siteVisits: ['siteVisits'] as const,
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

/** Every member's last site visit. Admin-only: the rules refuse anyone else. */
export function siteVisitsQueryOptions() {
  return queryOptions({
    queryKey: appUsageQueryKeys.siteVisits,
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'siteVisits'));
      const result = snapshot.docs.map((docSnap) => docSnap.data() as SiteVisit);
      return result;
    },
    staleTime: 60_000,
  });
}
