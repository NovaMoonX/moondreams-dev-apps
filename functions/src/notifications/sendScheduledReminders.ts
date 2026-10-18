import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  APP_ORIGIN,
  normalizeUids,
  sendPushToUsers,
  toAppUrl,
} from './sendPush.js';

if (getApps().length === 0) {
  initializeApp();
}

// A short poll interval bounds worst-case delivery lag to the interval
// itself if delivered naively (see below), while staying cheap at this
// app family's scale — a handful of households, not a high-volume queue.
// Cloud Tasks (or an equivalent delayed-task queue) is the standard way to
// get exact-time delivery at real scale; at this scale it's not worth the
// extra infrastructure.
const POLL_INTERVAL_MINUTES = 5;
const POLL_INTERVAL_MS = POLL_INTERVAL_MINUTES * 60 * 1000;

// A reminder this far overdue is no longer useful ("starting in 20 minutes"
// an hour late is wrong), and it is how an outage or a missing index would
// otherwise flush its whole backlog to people's phones at once.
const STALE_AFTER_MS = 30 * 60 * 1000;

const APP_PATHS: Record<string, string> = {
  'worth-the-wait': '/worth-the-wait',
  'nine-lives': '/nine-lives',
  waypoint: '/waypoint',
  'a-list': '/a-list',
  pinch: '/pinch',
};

/**
 * The absolute URL a tapped reminder opens: its own `link`, else the trip or app it belongs
 * to for reminders saved before links existed. Never leaves the app's origin.
 */
export function resolveReminderLink(reminder: DocumentData): string {
  const own = toAppUrl(reminder.link);

  if (own) {
    return own;
  }

  const tripId = /^apps\/waypoint\/trips\/([^/]+)\//.exec(String(reminder.relatedEntityPath ?? ''))?.[1];
  const fallback = tripId
    ? toAppUrl(`/waypoint?trip=${encodeURIComponent(tripId)}`)
    : toAppUrl(APP_PATHS[reminder.appId as string] ?? '/');

  return fallback ?? APP_ORIGIN;
}

/**
 * Claims a reminder inside a transaction so two invocations racing near a
 * poll boundary can't both deliver the same one — whichever invocation's
 * `scheduledFor` falls within a given window claims it here before waiting
 * out the remaining delay, so a still-`pending` reminder already claimed by
 * the prior invocation is skipped rather than sent twice.
 */
async function claimReminder(
  firestore: Firestore,
  ref: DocumentReference<DocumentData>,
): Promise<DocumentData | null> {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();

    if (!data || data.status !== 'pending' || data.claimedAt) {
      return null;
    }

    transaction.update(ref, { claimedAt: Date.now() });

    return data;
  });
}

function rollForwardYearly(scheduledFor: number, now: number): number {
  if (scheduledFor >= now) {
    return scheduledFor;
  }

  const next = new Date(scheduledFor);
  next.setFullYear(next.getFullYear() + 1);

  return rollForwardYearly(next.getTime(), now);
}

async function settleStaleReminder(
  ref: DocumentReference<DocumentData>,
  reminder: DocumentData,
  now: number,
): Promise<void> {
  if (reminder.recurrence === 'yearly') {
    await ref.update({
      scheduledFor: rollForwardYearly(reminder.scheduledFor as number, now),
      claimedAt: null,
    });
    return;
  }

  await ref.update({ status: 'expired' });
}

async function deliverReminder(
  firestore: Firestore,
  messaging: Messaging,
  ref: DocumentReference<DocumentData>,
  reminder: DocumentData,
): Promise<void> {
  await sendPushToUsers(firestore, messaging, normalizeUids(reminder.targetUids), {
    title: reminder.title,
    body: reminder.body,
    url: resolveReminderLink(reminder),
  });

  if (reminder.recurrence === 'yearly') {
    const nextOccurrence = new Date(reminder.scheduledFor as number);
    nextOccurrence.setFullYear(nextOccurrence.getFullYear() + 1);

    // Stays `pending` — a yearly reminder (a birthday, an anniversary) rolls
    // forward to next year's occurrence instead of terminating at `sent`.
    await ref.update({
      scheduledFor: nextOccurrence.getTime(),
      claimedAt: null,
      lastSentAt: Date.now(),
    });
  } else {
    await ref.update({ status: 'sent', lastSentAt: Date.now() });
  }
}

export const sendScheduledReminders = onSchedule(
  {
    schedule: `every ${POLL_INTERVAL_MINUTES} minutes`,
    timeoutSeconds: POLL_INTERVAL_MS / 1000 + 60,
  },
  async () => {
    const firestore = getFirestore();
    const messaging = getMessaging();
    const now = Date.now();
    const windowEnd = now + POLL_INTERVAL_MS;
    const staleBefore = now - STALE_AFTER_MS;

    // Looks ahead to everything due within this poll window, not just what's
    // already due, then waits out each one's exact remaining delay before
    // sending — this keeps delivery accurate to the second rather than
    // batching it to 5-minute boundaries, without a separate task queue.
    const dueRemindersSnapshot = await firestore
      .collection('reminders')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', windowEnd)
      .get();

    if (dueRemindersSnapshot.empty) {
      return;
    }

    const staleDocs = dueRemindersSnapshot.docs.filter(
      (reminderDoc) => (reminderDoc.get('scheduledFor') as number) < staleBefore,
    );
    const upcomingDocs = dueRemindersSnapshot.docs.filter(
      (reminderDoc) => (reminderDoc.get('scheduledFor') as number) >= staleBefore,
    );

    if (staleDocs.length > 0) {
      logger.info('Settling overdue reminders without sending', { count: staleDocs.length });
    }

    await Promise.all([
      ...staleDocs.map((reminderDoc) => settleStaleReminder(reminderDoc.ref, reminderDoc.data(), now)),
      ...upcomingDocs.map(async (reminderDoc) => {
        const claimed = await claimReminder(firestore, reminderDoc.ref);

        if (!claimed) {
          return;
        }

        const delayMs = Math.max(0, (claimed.scheduledFor as number) - Date.now());

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          // A reminder cancelled while this run waited for its time must not go out.
          if ((await reminderDoc.ref.get()).get('status') !== 'pending') {
            return;
          }
        }

        await deliverReminder(firestore, messaging, reminderDoc.ref, claimed);
      }),
    ]);
  },
);

export default sendScheduledReminders;
