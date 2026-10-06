import type { TimelineEvent } from '@apps/waypoint/types';

export function getEventAttendeeIds(
  event: Pick<TimelineEvent, 'attendeeTargetType' | 'assignedMemberIds'>,
  currentMemberIds: string[],
): string[] {
  return event.attendeeTargetType === 'EVERYONE_INCLUDING_FUTURE'
    ? currentMemberIds
    : event.assignedMemberIds;
}

/** Whether `uid` is one of the people an event is for (everyone, or the members it was assigned to). */
export function isEventForMember(
  event: Pick<TimelineEvent, 'attendeeTargetType' | 'assignedMemberIds'>,
  currentMemberIds: string[],
  uid: string,
): boolean {
  const result = getEventAttendeeIds(event, currentMemberIds).includes(uid);
  return result;
}
