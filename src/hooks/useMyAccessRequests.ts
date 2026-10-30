import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { AccessRequest } from '@lib/accessRequests/accessRequests';
import { db } from '@lib/firebase/config';

/** The signed-in person's own request for each of these apps, `null` where they haven't asked. */
export function useMyAccessRequests(appIds: string[], uid: string | null) {
  const [requests, setRequests] = useState<Record<string, AccessRequest | null>>({});
  const appIdsKey = appIds.join(',');

  useEffect(() => {
    if (uid === null || appIdsKey === '') return;
    const unsubscribers = appIdsKey.split(',').map((appId) =>
      onSnapshot(
        doc(db, 'apps', appId, 'accessRequests', uid),
        (snapshot) =>
          setRequests((current) => ({
            ...current,
            [`${uid}:${appId}`]: snapshot.exists() ? (snapshot.data() as AccessRequest) : null,
          })),
        (error) => console.error('Failed to load your access request:', error),
      ),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [appIdsKey, uid]);

  return Object.fromEntries(appIds.map((appId) => [appId, requests[`${uid}:${appId}`] ?? null]));
}
