import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startMyPendingRequestsListener,
  startTripPendingRequestsListener,
} from '../store/listeners/pendingRequestsListeners';
import { startTripListener } from '../store/listeners/tripListeners';
import {
  setMyPendingRequests,
  setTripPendingRequests,
} from '../store/slices/pendingRequestsSlice';
import { setTrips } from '../store/slices/tripSlice';

interface UseWaypointSyncOptions {
  // The trip the user currently has open, if any.
  tripId: string | null;
  // Whether the signed-in user is an Admin of that open trip — gates the
  // incoming-requests listener the same way the Members tab UI does.
  isTripAdmin: boolean;
}

// App-scoped Firestore sync for Waypoint, following the same shape as Nine
// Lives' useNineLivesSync: every listener is started once here — from the
// top-level orchestrator — and torn down only when its key actually
// changes, never on a leaf component (a tab, a panel) mounting/unmounting.
export function useWaypointSync(
  uid: string | null,
  { tripId, isTripAdmin }: UseWaypointSyncOptions,
) {
  const dispatch = useAppDispatch();

  // User-level: every trip the signed-in user belongs to, and every join
  // request they've sent — neither is tied to any single open trip.
  useEffect(() => {
    if (!uid) {
      dispatch(setTrips([]));
      dispatch(setMyPendingRequests([]));
      return;
    }

    const unsubscribeTrips = startTripListener(uid, (trips) => {
      dispatch(setTrips(trips));
    });
    const unsubscribeMyPendingRequests = startMyPendingRequestsListener(
      uid,
      (requests) => {
        dispatch(setMyPendingRequests(requests));
      },
    );

    return () => {
      unsubscribeTrips();
      unsubscribeMyPendingRequests();
    };
  }, [dispatch, uid]);

  // Trip-level: incoming requests for whichever trip is currently open,
  // per TECHNICAL.md's eager tier — Admin only, matching the Members tab.
  useEffect(() => {
    const activeTripId = isTripAdmin ? tripId : null;

    return startTripPendingRequestsListener(activeTripId, (requests) => {
      dispatch(setTripPendingRequests(requests));
    });
  }, [dispatch, tripId, isTripAdmin]);
}
