import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CustomLitterType } from '@apps/nine-lives/types';

export function startCustomLitterTypesListener(
  householdId: string,
  onChange: (types: CustomLitterType[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const typesQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'customLitterTypes'),
  );

  return createFirestoreCollectionListener<CustomLitterType>({
    query: typesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CustomLitterType, 'id'>),
    }),
    onData: onChange,
  });
}
