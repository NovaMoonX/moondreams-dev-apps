import type { Reminder } from './types';

/** How long after its time a reminder saved before `usefulForMs` existed still matters. The scheduled sender in `functions/` uses the same 30 minutes. */
export const DEFAULT_REMINDER_USEFUL_FOR_MS = 30 * 60 * 1000;

/** When a reminder stops being worth showing or sending: its time plus how long it stays useful. */
export function getReminderExpiresAt(
  reminder: Pick<Reminder, 'scheduledFor' | 'usefulForMs'>,
): number {
  return (
    reminder.scheduledFor +
    (reminder.usefulForMs ?? DEFAULT_REMINDER_USEFUL_FOR_MS)
  );
}

/** Whether a reminder is still worth telling the person about at `now`. */
export function isReminderStillUseful(
  reminder: Pick<Reminder, 'scheduledFor' | 'usefulForMs'>,
  now: number,
): boolean {
  return now <= getReminderExpiresAt(reminder);
}
