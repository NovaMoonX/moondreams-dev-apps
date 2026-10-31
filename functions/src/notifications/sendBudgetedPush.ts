import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

import { getLocalClock } from './localClock.js';
import { decidePush, readPushCount } from './pushBudget.js';
import { sendPushToUsers, type PushContent } from './sendPush.js';

export interface BudgetedPush {
  /** The app's id; the count is kept per app and never shared with another. */
  appId: string;
  uids: string[];
  content: PushContent;
  /** IANA zone whose clock decides quiet hours and the day; `null` reads as UTC. */
  zone: string | null;
  now: number;
}

export interface BudgetedPushResult {
  devices: number;
  quiet: number;
  capped: number;
}

/** Takes one push from a person's day inside a transaction, so overlapping runs can't pass the cap; the count is written before the send, so a failed send spends it. Admin SDK only: no rule matches `apps/{appId}/pushBudget`. */
const spendPush = (firestore: Firestore, appId: string, uid: string, day: string, hour: number) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(`apps/${appId}/pushBudget/${uid}`);
    const snapshot = await transaction.get(ref);
    const count = readPushCount(snapshot.data(), day);
    const verdict = decidePush(count, hour);
    if (verdict === 'send') {
      transaction.set(ref, { day, count: count + 1 });
    }
    return verdict;
  });

/** The one way an app sends a push nobody asked for: dropped overnight and past the daily cap, per person. Reminders a person set themselves go straight to `sendPushToUsers`. */
export async function sendBudgetedPush(
  firestore: Firestore,
  messaging: Messaging,
  { appId, uids, content, zone, now }: BudgetedPush,
): Promise<BudgetedPushResult> {
  const { date, hour } = getLocalClock(now, zone);
  const verdicts = await Promise.all(uids.map((uid) => spendPush(firestore, appId, uid, date, hour)));
  const allowed = uids.filter((_, index) => verdicts[index] === 'send');
  const devices = allowed.length > 0 ? await sendPushToUsers(firestore, messaging, allowed, content) : 0;
  return {
    devices,
    quiet: verdicts.filter((verdict) => verdict === 'quiet').length,
    capped: verdicts.filter((verdict) => verdict === 'capped').length,
  };
}
