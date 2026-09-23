import type { TimelineEvent } from '@apps/waypoint/types';

/** Resolves which members an event is for. `EVERYONE_INCLUDING_FUTURE` is computed
 * dynamically against the trip's current members; the other target types read the
 * snapshot stored in `assignedMemberIds`. */
export function getEventAttendeeIds(
  event: Pick<TimelineEvent, 'attendeeTargetType' | 'assignedMemberIds'>,
  currentMemberIds: string[],
): string[] {
  return event.attendeeTargetType === 'EVERYONE_INCLUDING_FUTURE'
    ? currentMemberIds
    : event.assignedMemberIds;
}
