import { collectionGroup, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';

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

  const preventivesQuery = query(
    collectionGroup(db, 'preventives'),
    where('householdId', '==', householdId),
    orderBy('administeredAt', 'desc'),
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
