import { cancelReminder, scheduleReminder } from '@/lib/notifications/scheduleReminder';
import type { ReminderRecurrence } from '@/lib/notifications/types';
import type { RootState } from '@/store';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderSpec {
  title: string;
  body: string;
  scheduledFor: number;
  relatedEntityPath: string;
  recurrence?: ReminderRecurrence;
}

export function getHouseholdMemberUids(state: RootState, householdId: string): string[] {
  return (
    state.nineLives.households.items.find((household) => household.id === householdId)
      ?.members ?? []
  );
}

/**
 * Schedules every spec, best-effort — reminders are a stretch feature, so one (or all) failing
 * to schedule (e.g. no household members yet, or a transient write failure) never blocks the
 * entity write it's attached to. Returns only the ids that actually got created.
 */
export async function scheduleEntityReminders(
  state: RootState,
  householdId: string,
  uid: string,
  specs: ReminderSpec[],
): Promise<string[]> {
  const targetUids = getHouseholdMemberUids(state, householdId);

  if (targetUids.length === 0 || specs.length === 0) {
    return [];
  }

  const results = await Promise.all(
    specs.map(async (spec) => {
      try {
        const reminder = await scheduleReminder({
          appId: 'nine-lives',
          targetUids,
          title: spec.title,
          body: spec.body,
          scheduledFor: spec.scheduledFor,
          createdBy: uid,
          relatedEntityPath: spec.relatedEntityPath,
          recurrence: spec.recurrence,
        });

        return reminder.id;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((id): id is string => id !== null);
}

/** Best-effort: same rationale as `scheduleEntityReminders`. */
export async function cancelEntityReminders(reminderIds: string[]): Promise<void> {
  await Promise.all(
    reminderIds.map(async (reminderId) => {
      try {
        await cancelReminder(reminderId);
      } catch {
        // Reminders are a stretch feature — a stale one is a lesser problem than blocking the write.
      }
    }),
  );
}
