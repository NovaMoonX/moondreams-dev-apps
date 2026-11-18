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

import { helmReminderSendHook } from '../apps/helm/reminders/sendHook.js';
import { pruneFinishedReminders } from './pruneReminders.js';
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
// extra infrastructure. One minute, so a timer of a minute or more
// is picked up before it ends and goes out on time.
const POLL_INTERVAL_MINUTES = 1;
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

export interface ReminderSendHook {
  /** The words to push at the second of sending, or null when the reminder is no longer wanted. */
  prepare(
    firestore: Firestore,
    reminder: DocumentData,
    now: number,
  ): Promise<{ title: string; body: string } | null>;
  /** Records that the push went out. */
  settle(
    firestore: Firestore,
    reminder: DocumentData,
    sentAt: number,
  ): Promise<void>;
}

/** An app whose reminders depend on what happened since they were planned checks them here before they go. */
export const REMINDER_SEND_HOOKS: Record<string, ReminderSendHook> = {
  helm: helmReminderSendHook,
};

const hookFor = (appId: unknown): ReminderSendHook | null =>
  typeof appId === 'string' && Object.hasOwn(REMINDER_SEND_HOOKS, appId)
    ? REMINDER_SEND_HOOKS[appId]
    : null;

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

/** What to push: the app's hook words, the stored words when there is no hook or it failed, null when the hook says it is not needed. */
async function prepareWords(
  firestore: Firestore,
  reminder: DocumentData,
  now: number,
): Promise<{ title: string; body: string } | null> {
  const hook = hookFor(reminder.appId);
  const stored = { title: reminder.title as string, body: reminder.body as string };

  if (!hook) {
    return stored;
  }

  try {
    return await hook.prepare(firestore, reminder, now);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    logger.error(`${reminder.appId}.reminders.checkFailed`, {
      code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown',
    });
    return stored;
  }
}

async function settleSent(
  firestore: Firestore,
  reminder: DocumentData,
  sentAt: number,
): Promise<void> {
  const hook = hookFor(reminder.appId);

  if (!hook) {
    return;
  }

  try {
    await hook.settle(firestore, reminder, sentAt);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    logger.error(`${reminder.appId}.reminders.settleFailed`, {
      code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown',
    });
  }
}

/** Writes a reminder's outcome only while it is still pending, so a cancel that landed meanwhile is not overwritten. Returns whether it was written. */
async function updateWhilePending(
  firestore: Firestore,
  ref: DocumentReference<DocumentData>,
  patch: DocumentData,
): Promise<boolean> {
  return firestore.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).get('status') !== 'pending') {
      return false;
    }

    transaction.update(ref, patch);

    return true;
  });
}

async function deliverReminder(
  firestore: Firestore,
  messaging: Messaging,
  ref: DocumentReference<DocumentData>,
  reminder: DocumentData,
  words: { title: string; body: string },
  clock: () => number,
): Promise<void> {
  await sendPushToUsers(firestore, messaging, normalizeUids(reminder.targetUids), {
    ...words,
    url: resolveReminderLink(reminder),
  });

  if (reminder.recurrence === 'yearly') {
    const nextOccurrence = new Date(reminder.scheduledFor as number);
    nextOccurrence.setFullYear(nextOccurrence.getFullYear() + 1);

    // Stays `pending` — a yearly reminder (a birthday, an anniversary) rolls
    // forward to next year's occurrence instead of terminating at `sent`.
    await updateWhilePending(firestore, ref, {
      scheduledFor: nextOccurrence.getTime(),
      claimedAt: null,
      lastSentAt: clock(),
    });
  } else {
    await updateWhilePending(firestore, ref, { status: 'sent', lastSentAt: clock() });
  }

  await settleSent(firestore, reminder, clock());
}

/** One sending pass as of `now`: what `sendScheduledReminders` runs every minute, callable with a fixed clock and a fake `messaging`. */
export async function runScheduledReminders(
  firestore: Firestore,
  messaging: Messaging,
  now: number,
): Promise<void> {
  const startedAt = Date.now();
  const clock = () => now + (Date.now() - startedAt);
  const windowEnd = now + POLL_INTERVAL_MS;
  const staleBefore = now - STALE_AFTER_MS;

  // Housekeeping runs beside the sending and never holds it up or fails it.
  const pruning = pruneFinishedReminders(firestore, now)
    .then((count) => {
      if (count > 0) {
        logger.info('Pruned finished reminders', { count });
      }
    })
    .catch((error) => logger.error('Pruning finished reminders failed', error));

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
    await pruning;
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

      const delayMs = Math.max(0, (claimed.scheduledFor as number) - clock());

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // A reminder cancelled while this run waited for its time must not go out.
        if ((await reminderDoc.ref.get()).get('status') !== 'pending') {
          return;
        }
      }

      const words = await prepareWords(firestore, claimed, clock());

      if (!words) {
        await updateWhilePending(firestore, reminderDoc.ref, { status: 'cancelled' });
        logger.info('reminders.notNeeded', { appId: claimed.appId });
        return;
      }

      if (hookFor(claimed.appId) && (await reminderDoc.ref.get()).get('status') !== 'pending') {
        return;
      }

      await deliverReminder(firestore, messaging, reminderDoc.ref, claimed, words, clock);
    }),
    pruning,
  ]);
}

export const sendScheduledReminders = onSchedule(
  {
    schedule: '* * * * *',
    timeoutSeconds: POLL_INTERVAL_MS / 1000 + 60,
  },
  async () => {
    await runScheduledReminders(getFirestore(), getMessaging(), Date.now());
  },
);

export default sendScheduledReminders;
