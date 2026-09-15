import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CatCondition } from '@apps/nine-lives/types';

export function startCatConditionsListener(
  householdId: string,
  catId: string,
  onChange: (conditions: CatCondition[]) => void,
): Unsubscribe {
  if (!householdId || !catId) {
    onChange([]);
    return () => undefined;
  }

  const catConditionsQuery = query(
    collection(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'cats',
      catId,
      'conditions',
    ),
  );

  return createFirestoreCollectionListener<CatCondition>({
    query: catConditionsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CatCondition, 'id'>),
    }),
    onData: onChange,
  });
}
