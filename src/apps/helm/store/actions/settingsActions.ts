import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '@apps/helm/constants';
import type { HelmProfile } from '@apps/helm/types';

/** Creates the profile on first open, with this device's zone, and leaves an existing one alone, so two tabs opening together make one. */
export async function ensureHelmProfile(uid: string) {
  const profileRef = doc(db, 'apps', 'helm', 'users', uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (snapshot.exists()) return;

    const profile: HelmProfile = {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayStartTime: DEFAULT_DAY_START_TIME,
      dayEndTime: DEFAULT_DAY_END_TIME,
      planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
      createdAt: Date.now(),
      lastEditedAt: null,
    };
    transaction.set(profileRef, profile);
  });
}
