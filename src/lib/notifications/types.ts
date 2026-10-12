export type NotificationChannel = 'push' | 'email';
/** `'expired'`: it came due long after its time (an outage), so it was dropped instead of sent. */
export type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'expired';
/** `'yearly'` reminders (a birthday, an anniversary) roll `scheduledFor` forward a year and stay `pending` after firing, instead of moving to `sent`. */
export type ReminderRecurrence = 'none' | 'yearly';

export interface Reminder {
  id: string;
  appId: string;
  targetUids: string[];
  title: string;
  body: string;
  scheduledFor: number;
  status: ReminderStatus;
  channels: NotificationChannel[];
  relatedEntityPath: string | null;
  recurrence: ReminderRecurrence;
  createdBy: string;
  createdAt: number;
}
