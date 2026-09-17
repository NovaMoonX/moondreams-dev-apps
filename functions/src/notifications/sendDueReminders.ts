import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (getApps().length === 0) {
  initializeApp();
}

function normalizeUids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((uid): uid is string => typeof uid === 'string');
}

export const sendDueReminders = onSchedule('every 5 minutes', async () => {
  const firestore = getFirestore();
  const messaging = getMessaging();
  const now = Date.now();

  const dueRemindersSnapshot = await firestore
    .collection('reminders')
    .where('status', '==', 'pending')
    .where('scheduledFor', '<=', now)
    .get();

  if (dueRemindersSnapshot.empty) {
    return;
  }

  await Promise.all(
    dueRemindersSnapshot.docs.map(async (reminderDoc) => {
      const reminder = reminderDoc.data();
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

      await reminderDoc.ref.update({ status: 'sent' });
    }),
  );
});

export default sendDueReminders;
