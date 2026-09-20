import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { LitterBox } from '@apps/nine-lives/types';

export function startLitterBoxesListener(
  householdId: string,
  onChange: (litterBoxes: LitterBox[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const litterBoxesQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'litterBoxes'),
  );

  return createFirestoreCollectionListener<LitterBox>({
    query: litterBoxesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<LitterBox, 'id'>),
    }),
    onData: onChange,
  });
}
