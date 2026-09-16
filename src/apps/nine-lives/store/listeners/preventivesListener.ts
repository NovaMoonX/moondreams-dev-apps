import { collectionGroup, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Preventive } from '@apps/nine-lives/types';

export function startPreventivesListener(
  householdId: string,
  onChange: (preventives: Preventive[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  // No orderBy: PreventiveTimeline sorts client-side, so this stays a single-field
  // equality query and doesn't need a composite index.
  const preventivesQuery = query(
    collectionGroup(db, 'preventives'),
    where('householdId', '==', householdId),
  );

  return createFirestoreCollectionListener<Preventive>({
    query: preventivesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Preventive, 'id'>),
    }),
    onData: onChange,
  });
}
