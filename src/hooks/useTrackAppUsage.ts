import { useEffect } from 'react';

import { DAY_MS } from '@/lib/query/queryClient';
import { recordAppOpened } from '@lib/appUsage/appUsage';

const lastCheckedAt = new Map<string, number>();

// A refusal won't change on a retry, so only failures that might pass later are tried again.
const FINAL_ERROR_CODES = [
  'functions/permission-denied',
  'functions/invalid-argument',
  'functions/unauthenticated',
  'permission-denied',
];

/** Notes that the signed-in member landed in `appId`. Call it from the mini-app's top-level page, so it only runs inside that app. */
export function useTrackAppUsage(appId: string, uid: string | null) {
  useEffect(() => {
    if (!uid) return;

    const key = `${appId}:${uid}`;
    const previous = lastCheckedAt.get(key);
    if (previous !== undefined && Date.now() - previous < DAY_MS) return;
    lastCheckedAt.set(key, Date.now());

    recordAppOpened(appId, uid).catch((error: unknown) => {
      const code = (error as { code?: string } | null)?.code ?? '';
      if (!FINAL_ERROR_CODES.includes(code)) {
        lastCheckedAt.delete(key);
      }
      console.error('Failed to record app usage:', error);
    });
  }, [appId, uid]);
}
