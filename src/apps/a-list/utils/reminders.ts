import { doc, collection } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { cancelReminder, scheduleReminder } from '@/lib/notifications/scheduleReminder';
import { TRAILER_REMINDER_DELAY_MINUTES } from '@apps/a-list/constants';

/** A fresh id to store on the viewing before the reminder itself exists. */
export function newTrailerReminderId() {
  const result = doc(collection(db, 'reminders')).id;
  return result;
}

/** Best-effort: a missed nudge never blocks saving the showing. */
export async function scheduleTrailerReminder({
  uid,
  reminderId,
  viewingId,
  showtimeAt,
}: {
  uid: string;
  reminderId: string;
  viewingId: string;
  showtimeAt: number;
}) {
  const scheduledFor = showtimeAt + TRAILER_REMINDER_DELAY_MINUTES * 60_000;
  if (scheduledFor <= Date.now()) {
    return;
  }

  try {
    await scheduleReminder({
      id: reminderId,
      appId: 'a-list',
      targetUids: [uid],
      title: '📽️ Trailers are rolling',
      body: 'Spot one you like? Add it to your watchlist while it’s fresh.',
      scheduledFor,
      createdBy: uid,
      relatedEntityPath: `apps/a-list/memberships/${uid}/viewings/${viewingId}`,
    });
  } catch {
    // Stored id then points at nothing, and cancelling it later is just as quiet.
  }
}

export async function cancelTrailerReminder(reminderId: string | null | undefined) {
  if (!reminderId) {
    return;
  }

  try {
    await cancelReminder(reminderId);
  } catch {
    // A stale reminder is a lesser problem than blocking the write.
  }
}
