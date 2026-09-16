import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase/config';
import type { TripJoinRequest } from '@apps/waypoint/types';

const PENDING_REQUESTS_COLLECTION = collection(
  db,
  'apps',
  'waypoint',
  'pendingRequests',
);

export function useMyPendingRequests(uid: string | null) {
  const [requests, setRequests] = useState<TripJoinRequest[]>([]);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const uidKey = uid ?? '';

  useEffect(() => {
    if (!uid) {
      return;
    }

    const requestsQuery = query(
      PENDING_REQUESTS_COLLECTION,
      where('uid', '==', uid),
    );

    return onSnapshot(
      requestsQuery,
      (snapshot) => {
        setRequests(
          snapshot.docs.map(
            (docSnapshot) => docSnapshot.data() as TripJoinRequest,
          ),
        );
        setLoadedUid(uid);
      },
      () => {
        setRequests([]);
        setLoadedUid(uid);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uidKey is the uid content signal
  }, [uidKey]);

  return {
    requests: uid ? requests : [],
    loading: Boolean(uid && loadedUid !== uid),
  };
}
