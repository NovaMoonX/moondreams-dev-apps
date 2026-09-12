import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Cat } from '@apps/nine-lives/types';

export function startCatsListener(
  householdId: string,
  onChange: (cats: Cat[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const catQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'cats'),
  );

  return createFirestoreCollectionListener<Cat>({
    query: catQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Cat, 'id'>),
    }),
    onData: onChange,
  });
}
