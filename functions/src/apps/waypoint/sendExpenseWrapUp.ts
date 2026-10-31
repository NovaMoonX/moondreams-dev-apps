import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { APP_ORIGIN, sendPushToUsers, toAppUrl } from '../../notifications/sendPush.js';
import { getAdminUids, getTripLink, getWrapUpDay, getWrapUpPush } from './tripPushes.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
/** The 9 PM note is stale by the next morning's plans; FCM drops it after this. */
const WRAP_UP_USEFUL_FOR_MS = 3 * 60 * 60 * 1000;
const STATE_PATH = 'apps/waypoint/pushState';
const EXPENSE_LIMIT = 50;

/** Takes the trip's day inside a transaction, so overlapping runs send one: the stamp is written before the push, which makes a failed send a skipped day rather than a doubled one. */
const claimDay = (firestore: Firestore, tripId: string, date: string) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(`${STATE_PATH}/${tripId}`);
    const snapshot = await transaction.get(ref);
    if (snapshot.get('lastWrapUpDay') === date) {
      return false;
    }
    transaction.set(ref, { lastWrapUpDay: date }, { merge: true });
    return true;
  });

async function wrapUpTrip(firestore: Firestore, tripId: string, trip: DocumentData, now: number): Promise<boolean> {
  const day = getWrapUpDay(trip, now);
  const adminUids = getAdminUids(trip);
  if (trip.isArchived === true || day === null || adminUids.length === 0) {
    return false;
  }

  const expenses = await firestore
    .collection(`apps/waypoint/trips/${tripId}/expenses`)
    .where('status', '==', 'EXPECTED')
    .where('dayIndex', '==', day.dayIndex)
    .limit(EXPENSE_LIMIT)
    .get();
  if (expenses.empty || !(await claimDay(firestore, tripId, day.date))) {
    return false;
  }

  const content = getWrapUpPush(
    expenses.docs.map((expense) => String(expense.get('title') ?? 'An expense')),
    trip.title,
  );
  await sendPushToUsers(firestore, getMessaging(), adminUids, {
    ...content,
    url: toAppUrl(getTripLink(tripId, 'expenses')) ?? APP_ORIGIN,
    usefulForMs: WRAP_UP_USEFUL_FOR_MS,
  });
  return true;
}

/**
 * Once a trip day reaches 9 PM in the trip's own time zone, asks the trip's Admins to mark the
 * day's still-expected expenses as paid. A day with none sends nothing and writes nothing.
 */
export const sendExpenseWrapUp = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 300 },
  async () => {
    const firestore = getFirestore();
    const now = Date.now();
    const trips = await firestore
      .collection('apps/waypoint/trips')
      .where('endDate', '>=', now - 2 * DAY_MS)
      .get();

    const results = await Promise.allSettled(trips.docs.map((trip) => wrapUpTrip(firestore, trip.id, trip.data(), now)));
    results.forEach((result) => {
      if (result.status === 'rejected') {
        logger.error('Expense wrap-up failed for one trip', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    logger.info('Expense wrap-up', {
      checked: trips.size,
      sent: results.filter((result) => result.status === 'fulfilled' && result.value).length,
    });
  },
);

export default sendExpenseWrapUp;
