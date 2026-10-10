import { cancelReminder, scheduleReminder } from '@/lib/notifications/scheduleReminder';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { formatClockTime } from '@/utils/formatUtils';
import { type EventTimeSource, formatEventArriveBy, getEventArriveByMs, getEventTime } from '@apps/waypoint/utils/tripTime';

function formatLead(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [
    hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '',
    rest ? `${rest} minutes` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export type EventReminderSource = EventTimeSource &
  Partial<Pick<TimelineEvent, 'arriveByTime'>> &
  Pick<
    TimelineEvent,
    'id' | 'title' | 'reminderMinutesBefore' | 'reminderEnabled' | 'assignedMemberIds'
  >;

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
  event: EventReminderSource;
}): Promise<string | null> {
  if (!event.reminderEnabled) {
    return null;
  }

  const startMs = getEventTime(trip, event).startMs;
  if (startMs === null) {
    return null;
  }

  // With an arrival chosen the reminder counts back from it, since being on time means being there then.
  const arriveByMs = getEventArriveByMs(trip, event);
  const arriveBy = formatEventArriveBy(trip, event);
  const targetMs = arriveByMs ?? startMs;
  const startLabel = event.startTime ? formatClockTime(event.startTime) : null;
  const body =
    arriveByMs !== null && arriveBy
      ? `Arrive by ${arriveBy}, in ${formatLead(event.reminderMinutesBefore)}.${startLabel ? ` Starts at ${startLabel}.` : ''}`
      : `Starting in ${formatLead(event.reminderMinutesBefore)}.`;

  const targetUids = getReminderTargetUids(trip, event.assignedMemberIds);
  if (targetUids.length === 0) {
    return null;
  }

  try {
    const reminder = await scheduleReminder({
      appId: 'waypoint',
      targetUids,
      title: event.title,
      body,
      scheduledFor: targetMs - event.reminderMinutesBefore * 60_000,
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
