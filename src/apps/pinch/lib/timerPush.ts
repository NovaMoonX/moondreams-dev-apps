import { cancelReminder } from '@/lib/notifications/scheduleReminder';
import { store } from '@/store';

const isGone = (reminderId: string) => {
  const status = store
    .getState()
    .reminders.items.find((reminder) => reminder.id === reminderId)?.status;
  return status !== undefined && status !== 'pending';
};

/** Cancels a timer push that has not gone out, never waited for; one that already went out or ended is left as it is, and a failure is only logged. */
export const cancelTimerPush = (reminderId: string) => {
  if (isGone(reminderId)) return;
  cancelReminder(reminderId).catch((error) =>
    console.error('Timer push could not be cancelled', error),
  );
};
