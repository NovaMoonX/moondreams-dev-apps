import { useEffect } from 'react';

import { DAY_MS } from '@/lib/query/queryClient';
import { recordAppOpened } from '@lib/appUsage/appUsage';

const lastCheckedAt = new Map<string, number>();

/** Notes that the signed-in member landed in `appId`. Call it from the mini-app's top-level page, so it only runs inside that app. */
export function useTrackAppUsage(appId: string, uid: string | null) {
  useEffect(() => {
    if (!uid) return;

    const key = `${appId}:${uid}`;
    const previous = lastCheckedAt.get(key);
    if (previous !== undefined && Date.now() - previous < DAY_MS) return;
    lastCheckedAt.set(key, Date.now());

    recordAppOpened(appId, uid).catch((error) => {
      lastCheckedAt.delete(key);
      console.error('Failed to record app usage:', error);
    });
  }, [appId, uid]);
}
