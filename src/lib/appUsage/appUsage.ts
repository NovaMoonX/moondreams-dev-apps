import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { DAY_MS } from '@/lib/query/queryClient';
import { db, functions } from '@lib/firebase/config';

/** One member's footprint in one app, at `apps/{appId}/usage/{uid}`. Both fields are instants. */
export interface AppUsage {
  uid: string;
  /** Written once by `registerAppUsage`: the oldest data the app held for them, else their first visit. */
  startedAt: number;
  /** Refreshed at most once a day while they use the app. */
  lastActiveAt: number;
}

export const ACTIVE_WINDOW_MONTHS = 3;

const ACTIVITY_REFRESH_MS = DAY_MS;

const registerAppUsageCallable = httpsCallable<{ appId: string }, AppUsage>(
  functions,
  'registerAppUsage',
);

/** The moment `ACTIVE_WINDOW_MONTHS` calendar months before `now`; members active since then count as active. */
export function getActiveSince(now: number) {
  const date = new Date(now);
  date.setMonth(date.getMonth() - ACTIVE_WINDOW_MONTHS);
  const result = date.getTime();
  return result;
}

/** Records that `uid` opened `appId`: registers them the first time, then refreshes `lastActiveAt` at most daily. */
export async function recordAppOpened(appId: string, uid: string) {
  const usageRef = doc(db, 'apps', appId, 'usage', uid);
  const snapshot = await getDoc(usageRef);

  if (!snapshot.exists()) {
    await registerAppUsageCallable({ appId });
    return;
  }

  const lastActiveAt = (snapshot.data() as AppUsage).lastActiveAt;
  if (Date.now() - lastActiveAt >= ACTIVITY_REFRESH_MS) {
    await updateDoc(usageRef, { lastActiveAt: Date.now() });
  }
}
