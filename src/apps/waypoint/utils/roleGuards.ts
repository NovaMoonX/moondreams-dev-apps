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

export function isTripActive(trip: TripSpace, now = Date.now()) {
  return now >= trip.startDate && now < trip.endDate;
}

/** Editing/deleting an already-existing item (event, stay, checklist item) narrows to
 * Admin-only while the trip is active — creating a new one stays open to Editors throughout. */
export function canEditExistingItem(trip: TripSpace, uid: string) {
  return isTripActive(trip) ? isTripAdmin(trip, uid) : hasTripRole(trip, uid, ['ADMIN', 'EDITOR']);
}
