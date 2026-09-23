import { cancelReminder, scheduleReminder } from '@/lib/notifications/scheduleReminder';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';

function getReminderTargetUids(trip: TripSpace, assignedMemberIds: string[]): string[] {
  return assignedMemberIds.length > 0 ? assignedMemberIds : Object.keys(trip.members);
}

/**
 * Schedules an event's reminder, best-effort — reminders are a stretch feature, so a
 * failure here (no members yet, a transient write failure) never blocks the event write.
 */
export async function scheduleEventReminder({
  trip,
  uid,
  event,
}: {
  trip: TripSpace;
  uid: string;
  event: Pick<
    TimelineEvent,
    'id' | 'title' | 'startAt' | 'reminderMinutesBefore' | 'reminderEnabled' | 'assignedMemberIds'
  >;
}): Promise<string | null> {
  if (!event.reminderEnabled) {
    return null;
  }

  const targetUids = getReminderTargetUids(trip, event.assignedMemberIds);
  if (targetUids.length === 0) {
    return null;
  }

  try {
    const reminder = await scheduleReminder({
      appId: 'waypoint',
      targetUids,
      title: event.title,
      body: `Starting in ${event.reminderMinutesBefore} minutes.`,
      scheduledFor: event.startAt - event.reminderMinutesBefore * 60_000,
      createdBy: uid,
      relatedEntityPath: `apps/waypoint/trips/${trip.id}/events/${event.id}`,
    });
    return reminder.id;
  } catch {
    return null;
  }
}

/** Best-effort: same rationale as `scheduleEventReminder`. */
export async function cancelEventReminder(reminderId: string | null): Promise<void> {
  if (!reminderId) {
    return;
  }

  try {
    await cancelReminder(reminderId);
  } catch {
    // Reminders are a stretch feature — a stale one is a lesser problem than blocking the write.
  }
}
