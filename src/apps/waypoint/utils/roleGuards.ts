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

const DAY_MS = 86_400_000;

// These gate who may write, so they use the same UTC boundaries as firestore.rules (which can't
// see the viewer's zone); the trip's display status is judged by the viewer's local day instead.
export function isTripActive(trip: TripSpace, now = Date.now()) {
  return now >= trip.startDate && now < trip.endDate + DAY_MS;
}

/** True once the trip has started, whether it's still ongoing or already over. */
export function hasTripStarted(trip: TripSpace, now = Date.now()) {
  return now >= trip.startDate;
}

/** Any member may post an idea, but only until the trip starts; voting and reading never close. */
export function canAddIdea(trip: TripSpace, uid: string, now = Date.now()) {
  return isTripMember(trip, uid) && !hasTripStarted(trip, now);
}

/** Only an idea's own poster may edit it, in any trip phase. */
export function canEditIdea(trip: TripSpace, uid: string, idea: { addedByUid: string }) {
  return idea.addedByUid === uid && isTripMember(trip, uid);
}

/** The poster may delete their own idea; an Admin may also remove anyone's. */
export function canDeleteIdea(trip: TripSpace, uid: string, idea: { addedByUid: string }) {
  return canEditIdea(trip, uid, idea) || isTripAdmin(trip, uid);
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
