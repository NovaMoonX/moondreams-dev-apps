import { doc, collection } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { cancelReminder, scheduleReminder } from '@/lib/notifications/scheduleReminder';
import { TRAILER_REMINDER_DELAY_MINUTES } from '@apps/a-list/constants';

/** Whether a showing's trailer push is still ahead of us. */
export function isTrailerReminderAhead(showtimeAt: number) {
  const result =
    showtimeAt + TRAILER_REMINDER_DELAY_MINUTES * 60_000 > Date.now();
  return result;
}

/** The id to store on the viewing, or null when the push would already be past. */
export function newTrailerReminderId(showtimeAt: number) {
  const result = isTrailerReminderAhead(showtimeAt)
    ? doc(collection(db, 'reminders')).id
    : null;
  return result;
}

/** Best-effort: a missed nudge never blocks saving the showing. */
export async function scheduleTrailerReminder({
  uid,
  reminderId,
  viewingId,
  movieTitle,
  showtimeAt,
}: {
  uid: string;
  reminderId: string;
  viewingId: string;
  movieTitle: string;
  showtimeAt: number;
}) {
  try {
    await scheduleReminder({
      id: reminderId,
      appId: 'a-list',
      targetUids: [uid],
      title: 'Previews time 📽️',
      body: `Spot a movie you like at ${movieTitle}? Add it to your watchlist while it’s fresh.`,
      scheduledFor: showtimeAt + TRAILER_REMINDER_DELAY_MINUTES * 60_000,
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
