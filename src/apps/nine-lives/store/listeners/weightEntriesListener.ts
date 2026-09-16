import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { WeightEntry } from '@apps/nine-lives/types';

export function startWeightEntriesListener(
  householdId: string,
  onChange: (weightEntries: WeightEntry[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const weightEntriesQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'weightEntries'),
  );

  return createFirestoreCollectionListener<WeightEntry>({
    query: weightEntriesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<WeightEntry, 'id'>),
    }),
    onData: onChange,
  });
}
