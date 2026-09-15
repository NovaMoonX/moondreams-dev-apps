import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Visit } from '@apps/nine-lives/types';

export function startVisitsListener(
  householdId: string,
  onChange: (visits: Visit[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const visitsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'visits'),
  );

  return createFirestoreCollectionListener<Visit>({
    query: visitsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Visit, 'id'>),
    }),
    onData: onChange,
  });
}
