import { WAYPOINT_HELD_KINDS } from '@apps/waypoint/store/heldLists';

const KINDS = new Set<string>(WAYPOINT_HELD_KINDS);

/** The kind and id of a record in the open trip's collection, or the trip document itself, that a listener list reads; anything else (personal lists, pending requests, invites) is never held. */
export const readWaypointTarget = (
  segments: string[],
  tripId: string | null,
): { kind: string; id: string } | null => {
  const [apps, waypoint, trips, trip, collection, id, ...rest] = segments;
  if (apps !== 'apps' || waypoint !== 'waypoint' || trips !== 'trips') {
    return null;
  }
  if (trip === undefined) return null;
  if (collection === undefined) return { kind: 'trips', id: trip };
  if (trip !== tripId || id === undefined || rest.length > 0) return null;
  return collection !== 'trips' && KINDS.has(collection)
    ? { kind: collection, id }
    : null;
};
