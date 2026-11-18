import type { Firestore } from 'firebase-admin/firestore';

import { getQuotaDay, readCap, stepBudget } from '../imageSearch/usage.js';

export const VIDEO_SEARCH_DAILY_CAP = 90;
const QUOTA_ZONE = 'America/Los_Angeles';

/** Takes one search from today's budget, counted by Pacific day in a document of the server's own (never readable by a client). The cap is `VIDEO_SEARCH_DAILY_CAP` in the environment, 90 when unset. */
export const createDailyReserve =
  (
    firestore: Firestore,
    collectionPath: string,
    now: () => number = Date.now,
  ) =>
  async () => {
    const cap = readCap(
      process.env.VIDEO_SEARCH_DAILY_CAP,
      VIDEO_SEARCH_DAILY_CAP,
    );
    const ref = firestore.doc(
      `${collectionPath}/${getQuotaDay(now(), QUOTA_ZONE)}`,
    );
    return firestore.runTransaction(async (transaction) => {
      const count = Number((await transaction.get(ref)).get('count') ?? 0);
      const step = stepBudget(count, cap);
      if (step.allowed) transaction.set(ref, { count: step.next });
      return step.allowed;
    });
  };
