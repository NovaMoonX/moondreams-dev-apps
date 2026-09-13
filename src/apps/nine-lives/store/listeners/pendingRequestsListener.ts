import { collection, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { PendingHouseholdRequest } from '@apps/nine-lives/types';

export function startPendingRequestsListener(
  householdId: string | null,
  onChange: (requests: PendingHouseholdRequest[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const pendingRequestQuery = query(
    collection(db, 'apps', 'nine-lives', 'pendingRequests'),
    where('householdId', '==', householdId),
  );

  return createFirestoreCollectionListener<PendingHouseholdRequest>({
    query: pendingRequestQuery,
    normalize: (_id, data) => data as PendingHouseholdRequest,
    onData: onChange,
  });
}
