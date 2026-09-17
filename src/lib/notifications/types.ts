export type NotificationChannel = 'push' | 'email';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled';

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
  createdBy: string;
  createdAt: number;
}
