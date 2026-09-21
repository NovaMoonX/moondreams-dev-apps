import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startMyPendingRequestsListener,
  startTripPendingRequestsListener,
} from '../store/listeners/pendingRequestsListeners';
import { startTripListener } from '../store/listeners/tripListeners';
import { startTripExpensesListener } from '../store/listeners/expenseListeners';
import {
  setMyPendingRequests,
  setTripPendingRequests,
} from '../store/slices/pendingRequestsSlice';
import { setTrips } from '../store/slices/tripSlice';
import { clearExpenses, setExpenses } from '../store/slices/expensesSlice';

interface UseWaypointSyncOptions {
  tripId: string | null;
  isTripAdmin: boolean;
}

export function useWaypointSync(
  uid: string | null,
  { tripId, isTripAdmin }: UseWaypointSyncOptions,
) {
  const dispatch = useAppDispatch();

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

  useEffect(() => {
    const activeTripId = isTripAdmin ? tripId : null;

    return startTripPendingRequestsListener(activeTripId, (requests) => {
      dispatch(setTripPendingRequests(requests));
    });
  }, [dispatch, tripId, isTripAdmin]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearExpenses());
      return;
    }

    return startTripExpensesListener(tripId, (expenses) => {
      dispatch(setExpenses({ tripId, expenses }));
    });
  }, [dispatch, tripId]);
}
