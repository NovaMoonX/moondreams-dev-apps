import { doc, type DocumentReference } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';

interface Writer {
  update: (ref: DocumentReference, data: Record<string, unknown>) => unknown;
}

const profileOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** The field every change a reminder depends on writes, so the server re-plans within minutes. */
export const remindersStamp = (now: number) => ({
  habitRemindersChangedAt: now,
});

/** Stamps the profile inside the batch or transaction that makes the change, never as a write of its own. A tick never calls this: the send check reads ticks itself. */
export const markRemindersChanged = (
  writer: Writer,
  uid: string,
  now: number,
) => writer.update(profileOf(uid), remindersStamp(now));

/** After a long quiet spell the planner stops and says so; the person's next check-in or capture ends that, in the same batch, and the stamp makes it plan again. Says whether it wrote, so Today can say once that reminders are back. */
export const clearRemindersIdle = (
  writer: Writer,
  uid: string,
  now: number,
) => {
  if (!store.getState().helm.profile?.habitRemindersIdleAt) return false;
  writer.update(profileOf(uid), {
    habitRemindersIdleAt: null,
    ...remindersStamp(now),
  });
  return true;
};
