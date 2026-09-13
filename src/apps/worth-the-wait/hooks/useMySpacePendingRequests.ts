import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase/config';
import type { PendingSpaceRequest } from '@apps/worth-the-wait/types';

// A user can have at most one open request (doc id == uid), so this is a
// single-document get(), not a query — no list-safety concerns at all.
export function useMySpacePendingRequests(uid: string | null) {
  const [requests, setRequests] = useState<PendingSpaceRequest[]>([]);
  const [uid_, setUid_] = useState(uid);

  if (uid !== uid_) {
    setUid_(uid);
    setRequests([]);
  }

  useEffect(() => {
    if (!uid) {
      return;
    }

    const requestRef = doc(db, 'apps', 'worth-the-wait', 'pendingRequests', uid);

    const unsubscribe = onSnapshot(requestRef, (snapshot) => {
      setRequests(snapshot.exists() ? [snapshot.data() as PendingSpaceRequest] : []);
    });

    return () => unsubscribe();
  }, [uid]);

  return requests;
}
