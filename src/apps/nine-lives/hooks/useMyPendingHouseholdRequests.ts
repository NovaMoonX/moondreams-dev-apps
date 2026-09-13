import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase/config';
import type { PendingHouseholdRequest } from '@apps/nine-lives/types';

export function useMyPendingHouseholdRequests(uid: string | null) {
  const [requests, setRequests] = useState<PendingHouseholdRequest[]>([]);
  const [uid_, setUid_] = useState(uid);

  if (uid !== uid_) {
    setUid_(uid);
    setRequests([]);
  }

  useEffect(() => {
    if (!uid) {
      return;
    }

    const myRequestsQuery = query(
      collection(db, 'apps', 'nine-lives', 'pendingRequests'),
      where('uid', '==', uid),
    );

    const unsubscribe = onSnapshot(myRequestsQuery, (snapshot) => {
      setRequests(snapshot.docs.map((docSnapshot) => docSnapshot.data() as PendingHouseholdRequest));
    });

    return () => unsubscribe();
  }, [uid]);

  return requests;
}
