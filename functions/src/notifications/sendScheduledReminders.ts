import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';

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

function normalizeUids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((uid): uid is string => typeof uid === 'string');
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

async function deliverReminder(
  firestore: Firestore,
  messaging: Messaging,
  ref: DocumentReference<DocumentData>,
  reminder: DocumentData,
): Promise<void> {
  const targetUids = normalizeUids(reminder.targetUids);
  const userSnapshots = await Promise.all(
    targetUids.map((uid) => firestore.doc(`users/${uid}`).get()),
  );
  const tokens = userSnapshots.flatMap((userSnapshot) =>
    normalizeUids(userSnapshot.data()?.fcmTokens),
  );

  if (tokens.length > 0) {
    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: reminder.title,
        body: reminder.body,
      },
    });
  }

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
    const windowEnd = Date.now() + POLL_INTERVAL_MS;

    // Looks ahead to everything due within this poll window, not just what's
    // already due, then waits out each one's exact remaining delay before
    // sending — this keeps delivery accurate to the second rather than
    // batching it to 5-minute boundaries, without a separate task queue.
    const upcomingRemindersSnapshot = await firestore
      .collection('reminders')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', windowEnd)
      .get();

    if (upcomingRemindersSnapshot.empty) {
      return;
    }

    await Promise.all(
      upcomingRemindersSnapshot.docs.map(async (reminderDoc) => {
        const claimed = await claimReminder(firestore, reminderDoc.ref);

        if (!claimed) {
          return;
        }

        const delayMs = Math.max(0, (claimed.scheduledFor as number) - Date.now());

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        await deliverReminder(firestore, messaging, reminderDoc.ref, claimed);
      }),
    );
  },
);

export default sendScheduledReminders;
