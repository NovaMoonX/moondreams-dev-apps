import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { LitterEntry } from '@apps/nine-lives/types';

export function startLitterEntriesListener(
  householdId: string,
  onChange: (entries: LitterEntry[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const entriesQuery = query(
    collection(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'litterEntries',
    ),
  );

  return createFirestoreCollectionListener<LitterEntry>({
    query: entriesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<LitterEntry, 'id'>),
    }),
    onData: onChange,
  });
}
