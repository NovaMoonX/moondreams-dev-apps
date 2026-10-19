import type { Firestore } from 'firebase-admin/firestore';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a finished reminder is kept: long enough for every open page to have seen it change. */
export const PRUNE_AFTER_MS = 14 * DAY_MS;

/** What one run deletes at most, so a backlog is worked off over a few runs. */
export const PRUNE_BATCH_SIZE = 200;

export const FINISHED_STATUSES = ['sent', 'cancelled', 'expired'];

export const getPruneCutoff = (now: number) => now - PRUNE_AFTER_MS;

/** Whether a stored reminder is finished (never pending, never a yearly one rolled forward) and was due before the cutoff. */
export const isPrunable = (
  reminder: { status?: unknown; scheduledFor?: unknown },
  now: number,
) =>
  typeof reminder.status === 'string' &&
  FINISHED_STATUSES.includes(reminder.status) &&
  typeof reminder.scheduledFor === 'number' &&
  reminder.scheduledFor < getPruneCutoff(now);

/** Deletes up to `PRUNE_BATCH_SIZE` finished reminders due more than `PRUNE_AFTER_MS` ago and returns how many. Reminders are written by people and never deleted by the client, so this is the only thing that stops the collection growing. */
export async function pruneFinishedReminders(
  firestore: Firestore,
  now: number,
): Promise<number> {
  const snapshot = await firestore
    .collection('reminders')
    .where('status', 'in', FINISHED_STATUSES)
    .where('scheduledFor', '<', getPruneCutoff(now))
    .limit(PRUNE_BATCH_SIZE)
    .get();
  const stale = snapshot.docs.filter((reminderDoc) =>
    isPrunable(reminderDoc.data(), now),
  );

  if (stale.length === 0) {
    return 0;
  }

  const batch = firestore.batch();
  stale.forEach((reminderDoc) => batch.delete(reminderDoc.ref));
  await batch.commit();

  return stale.length;
}
