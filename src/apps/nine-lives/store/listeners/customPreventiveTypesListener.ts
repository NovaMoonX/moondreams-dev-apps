import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CustomPreventiveType } from '@apps/nine-lives/types';

export function startCustomPreventiveTypesListener(
  householdId: string,
  onChange: (types: CustomPreventiveType[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const typesQuery = query(
    collection(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'customPreventiveTypes',
    ),
  );

  return createFirestoreCollectionListener<CustomPreventiveType>({
    query: typesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CustomPreventiveType, 'id'>),
    }),
    onData: onChange,
  });
}
