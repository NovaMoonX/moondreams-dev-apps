import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Litter } from '@apps/nine-lives/types';

export function startLittersListener(
  householdId: string,
  onChange: (litters: Litter[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const littersQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'litters'),
  );

  return createFirestoreCollectionListener<Litter>({
    query: littersQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Litter, 'id'>),
    }),
    onData: onChange,
  });
}
