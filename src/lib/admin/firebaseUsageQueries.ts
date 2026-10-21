import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

import { ADMIN_QUERY_KEY } from './adminQueries';

export interface FirebaseUsageLine {
  id: string;
  product: 'Firestore' | 'Realtime Database' | 'Cloud Storage' | 'Functions';
  label: string;
  unit: 'count' | 'bytes';
  /** `day` and `month` free amounts reset on that cycle; `stock` is an amount held. */
  period: 'day' | 'month' | 'stock';
  used: number;
  freeAmount: number;
  isOver: boolean;
  daysOver: number | null;
  monthToDateCostUsd: number;
  projectedCostUsd: number;
}

export interface FirebaseFootprints {
  apps: { appId: string; documents: number; storageBytes: number }[];
  sharedStorageBytes: number;
  isPartial: boolean;
  measuredAt: number;
}

export interface FirebaseUsage {
  lines: FirebaseUsageLine[];
  monthToDateCostUsd: number;
  projectedCostUsd: number;
  pricingCheckedOn: string;
  footprints: FirebaseFootprints | null;
  isSample: boolean;
  generatedAt: number;
}

export const MONITORING_ROLE_MISSING = 'monitoring-role-missing';

const getFirebaseUsageCallable = httpsCallable<void, FirebaseUsage>(functions, 'getFirebaseUsage', {
  timeout: 120_000,
});

/** Project-wide Firebase usage from Cloud Monitoring. A one-shot read, refreshed with the rest of the dashboard. */
export function firebaseUsageQueryOptions() {
  return queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, 'firebase-usage'] as const,
    queryFn: async () => {
      const result = await getFirebaseUsageCallable();
      return result.data;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
