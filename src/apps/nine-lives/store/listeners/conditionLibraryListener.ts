import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { LibraryCondition } from '@apps/nine-lives/types';

export function startConditionLibraryListener(
  onChange: (conditions: LibraryCondition[]) => void,
): Unsubscribe {
  const conditionLibraryQuery = query(
    collection(db, 'apps', 'nine-lives', 'conditionLibrary'),
  );

  return createFirestoreCollectionListener<LibraryCondition>({
    query: conditionLibraryQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<LibraryCondition, 'id'>),
    }),
    onData: onChange,
  });
}
