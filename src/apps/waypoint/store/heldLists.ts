import { createHeldActions } from '@/store/heldLists';

/** Each trip collection a transaction's write can be held over, by its listener list; `trips` is the trip document itself, held over the trips list. */
export const WAYPOINT_HELD_KINDS = [
  'events',
  'stays',
  'rentals',
  'expenses',
  'checklist',
  'eventSuggestions',
  'ideas',
  'announcements',
  'trips',
] as const;

export const waypointHeldActions = createHeldActions('waypoint');
