import { createHeldTransaction } from '@/lib/firebase/heldTransaction';
import { store } from '@/store';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import { normalizeExpense } from '@apps/waypoint/store/listeners/expenseListeners';
import { readTrip } from '@apps/waypoint/store/listeners/tripListeners';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';
import { readWaypointTarget } from '@apps/waypoint/utils/heldHolds';

const isLanded = (token: string) => {
  const { waypoint } = store.getState();
  return [
    waypoint.events,
    waypoint.stays,
    waypoint.rentals,
    waypoint.expenses,
    waypoint.checklist,
    waypoint.eventSuggestions,
    waypoint.ideas,
    waypoint.announcements,
    waypoint.trip,
  ].every(({ hold }) => hold.held.every((held) => held.token !== token));
};

/** A transaction whose changes to a trip's records show at once, go back if it fails, and are watched until the listeners show them. */
export const runHeldTransaction = createHeldTransaction({
  feature: 'Waypoint',
  actions: waypointHeldActions,
  readTarget: readWaypointTarget,
  open: (kind, data) => {
    const { id, ...rest } = data;
    if (kind === 'expenses') {
      return normalizeExpense(id, rest as Partial<TripExpense>);
    }
    if (kind === 'trips') return readTrip(id, rest as Omit<TripSpace, 'id'>);
    return data;
  },
  isLanded,
});
