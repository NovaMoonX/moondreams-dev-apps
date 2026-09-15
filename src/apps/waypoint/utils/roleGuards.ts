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
