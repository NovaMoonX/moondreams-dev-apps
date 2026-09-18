import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

import type { NotificationChannel, Reminder, ReminderRecurrence } from './types';

export interface ScheduleReminderInput {
  id?: string;
  appId: string;
  targetUids: string[];
  title: string;
  body: string;
  scheduledFor: number;
  createdBy: string;
  channels?: NotificationChannel[];
  relatedEntityPath?: string | null;
  /** `'yearly'` re-fires this same reminder on the same month/day every year (e.g. a birthday) instead of firing once. Defaults to `'none'`. */
  recurrence?: ReminderRecurrence;
}

const remindersCollectionRef = () => collection(db, 'reminders');

/** Thin, app-agnostic helper any mini-app can call to schedule a push reminder. */
export async function scheduleReminder(input: ScheduleReminderInput): Promise<Reminder> {
  const reminderId = input.id ?? doc(remindersCollectionRef()).id;

  const reminder: Reminder = {
    id: reminderId,
    appId: input.appId,
    targetUids: input.targetUids,
    title: input.title,
    body: input.body,
    scheduledFor: input.scheduledFor,
    status: 'pending',
    channels: input.channels ?? ['push'],
    relatedEntityPath: input.relatedEntityPath ?? null,
    recurrence: input.recurrence ?? 'none',
    createdBy: input.createdBy,
    createdAt: Date.now(),
  };

  await setDoc(doc(remindersCollectionRef(), reminderId), reminder);

  return reminder;
}

/** Cancels a pending reminder before it fires. */
export async function cancelReminder(reminderId: string): Promise<void> {
  await updateDoc(doc(db, 'reminders', reminderId), { status: 'cancelled' });
}
