import { useEffect } from 'react';

import { recordAppOpened } from '@lib/appUsage/appUsage';

const recordedThisSession = new Set<string>();

/** Notes that the signed-in member opened `appId`, once per page load. Call it from the mini-app's top-level page. */
export function useTrackAppUsage(appId: string, uid: string | null) {
  useEffect(() => {
    if (!uid) return;

    const key = `${appId}:${uid}`;
    if (recordedThisSession.has(key)) return;
    recordedThisSession.add(key);

    recordAppOpened(appId, uid).catch((error) => {
      recordedThisSession.delete(key);
      console.error('Failed to record app usage:', error);
    });
  }, [appId, uid]);
}
