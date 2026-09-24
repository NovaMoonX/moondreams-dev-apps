import type { TimelineEvent } from '@apps/waypoint/types';

export function getEventAttendeeIds(
  event: Pick<TimelineEvent, 'attendeeTargetType' | 'assignedMemberIds'>,
  currentMemberIds: string[],
): string[] {
  return event.attendeeTargetType === 'EVERYONE_INCLUDING_FUTURE'
    ? currentMemberIds
    : event.assignedMemberIds;
}
