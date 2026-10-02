import { getDayCount, getLocalDayIndex } from '@/utils/dateRangeUtils';
import type { TripSpace, UserRole } from '@apps/waypoint/types';

export function getTripMember(trip: TripSpace, uid: string) {
  return trip.members[uid] ?? null;
}

export function isTripMember(trip: TripSpace, uid: string) {
  return getTripMember(trip, uid)?.uid === uid;
}

export function hasTripRole(
  trip: TripSpace,
  uid: string,
  roles: UserRole | UserRole[],
) {
  const member = getTripMember(trip, uid);
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return member !== null && allowedRoles.includes(member.role);
}

export function isTripAdmin(trip: TripSpace, uid: string) {
  return hasTripRole(trip, uid, 'ADMIN');
}

export function canChangeRole(
  trip: TripSpace,
  currentUserId: string,
  targetUserId: string,
) {
  return (
    currentUserId !== targetUserId &&
    targetUserId !== trip.createdBy &&
    isTripAdmin(trip, currentUserId) &&
    isTripMember(trip, targetUserId)
  );
}

export function canRemoveMembers(
  trip: TripSpace,
  currentUserId: string,
  targetUserId: string,
) {
  return canChangeRole(trip, currentUserId, targetUserId);
}

/** Judged by the viewer's local calendar day, so the trip's last day still counts as active. */
export function isTripActive(trip: TripSpace, now = Date.now()) {
  const dayIndex = getLocalDayIndex(trip.startDate, now);
  return dayIndex >= 0 && dayIndex < getDayCount(trip.startDate, trip.endDate);
}

/** True once the trip has started, whether it's still ongoing or already over. */
export function hasTripStarted(trip: TripSpace, now = Date.now()) {
  return getLocalDayIndex(trip.startDate, now) >= 0;
}

/** Editing/deleting an already-existing item (event, stay, checklist item) narrows to
 * Admin-only while the trip is active — creating a new one follows `canCreateItem` instead. */
export function canEditExistingItem(trip: TripSpace, uid: string) {
  return isTripActive(trip) ? isTripAdmin(trip, uid) : hasTripRole(trip, uid, ['ADMIN', 'EDITOR']);
}

/** Archiving or restoring an event is Admin-only whatever the trip's phase, since approving
 * an event suggestion archives its source event even before the trip starts. */
export function canArchiveEvent(trip: TripSpace, uid: string) {
  return isTripAdmin(trip, uid);
}

/** Creating a brand-new event/stay stays open to Editors before the trip starts, but
 * narrows to Admin-only once it has — an already-underway plan needs one steward, same
 * as editing an existing item. */
export function canCreateItem(trip: TripSpace, uid: string) {
  return hasTripStarted(trip) ? isTripAdmin(trip, uid) : hasTripRole(trip, uid, ['ADMIN', 'EDITOR']);
}
