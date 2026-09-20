import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect } from 'react';

import { db } from '@/lib/firebase/config';
import { useAppDispatch, useAppSelector } from '@/store';
import type { TripJoinRequest } from '@apps/waypoint/types';
import { setPendingRequests } from '@apps/waypoint/store/slices/pendingRequestsSlice';

const PENDING_REQUESTS_COLLECTION = collection(
  db,
  'apps',
  'waypoint',
  'pendingRequests',
);

export function useMyPendingRequests(uid: string | null) {
  const dispatch = useAppDispatch();
  const requests = useAppSelector(
    (state) => state.waypoint.pendingRequests.items,
  );
  const loaded = useAppSelector(
    (state) => state.waypoint.pendingRequests.loaded,
  );

  useEffect(() => {
    if (!uid) {
      dispatch(setPendingRequests([]));
      return;
    }

    const requestsQuery = query(
      PENDING_REQUESTS_COLLECTION,
      where('uid', '==', uid),
    );

    return onSnapshot(
      requestsQuery,
      (snapshot) => {
        dispatch(
          setPendingRequests(
            snapshot.docs.map(
              (docSnapshot) => docSnapshot.data() as TripJoinRequest,
            ),
          ),
        );
      },
      () => {
        dispatch(setPendingRequests([]));
      },
    );
  }, [dispatch, uid]);

  return {
    requests: uid ? requests : [],
    loading: Boolean(uid) && !loaded,
  };
}
