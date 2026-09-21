import { collection, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { TripJoinRequest } from '@apps/waypoint/types';

const PENDING_REQUESTS_COLLECTION = collection(
  db,
  'apps',
  'waypoint',
  'pendingRequests',
);

export function startMyPendingRequestsListener(
  uid: string | null,
  onChange: (requests: TripJoinRequest[]) => void,
): Unsubscribe {
  if (!uid) {
    onChange([]);
    return () => undefined;
  }

  const myRequestsQuery = query(
    PENDING_REQUESTS_COLLECTION,
    where('uid', '==', uid),
  );

  return createFirestoreCollectionListener<TripJoinRequest>({
    query: myRequestsQuery,
    normalize: (_id, data) => data as TripJoinRequest,
    onData: onChange,
  });
}

export function startTripPendingRequestsListener(
  tripId: string | null,
  onChange: (requests: TripJoinRequest[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  const tripRequestsQuery = query(
    PENDING_REQUESTS_COLLECTION,
    where('tripId', '==', tripId),
  );

  return createFirestoreCollectionListener<TripJoinRequest>({
    query: tripRequestsQuery,
    normalize: (_id, data) => data as TripJoinRequest,
    onData: onChange,
  });
}
