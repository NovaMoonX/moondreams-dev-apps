import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CustomHealthRecordType } from '@apps/nine-lives/types';

export function startCustomHealthRecordTypesListener(
  householdId: string,
  onChange: (types: CustomHealthRecordType[]) => void,
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
      'customHealthRecordTypes',
    ),
  );

  return createFirestoreCollectionListener<CustomHealthRecordType>({
    query: typesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CustomHealthRecordType, 'id'>),
    }),
    onData: onChange,
  });
}
