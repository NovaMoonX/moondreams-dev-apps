import type { Firestore } from 'firebase-admin/firestore';

import { queuePath, readQueue, type QueueSlot } from './readRecords.js';

/** Cancels each slot's reminder that is still pending; one a sender already sent stays as it is. Returns how many it cancelled. */
export const cancelSlots = async (
  firestore: Firestore,
  slots: QueueSlot[],
): Promise<number> =>
  (
    await Promise.all(
      slots.map((slot) =>
        firestore.runTransaction<number>(async (transaction) => {
          const ref = firestore.doc(`reminders/${slot.reminderId}`);
          const snap = await transaction.get(ref);
          if (!snap.exists || snap.get('status') !== 'pending') return 0;
          transaction.update(ref, { status: 'cancelled' });
          return 1;
        }),
      ),
    )
  ).reduce((sum, one) => sum + one, 0);

/** Ends everything the planner scheduled for a person: cancels the queue's pending reminders, then deletes the queue. */
export async function deleteReminderQueue(
  firestore: Firestore,
  uid: string,
): Promise<number> {
  const ref = firestore.doc(queuePath(uid));
  const snap = await ref.get();
  const cancelled = await cancelSlots(
    firestore,
    Object.values(readQueue(snap.data()).slots),
  );
  await ref.delete();
  return cancelled;
}
