import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { IngestionDraft } from '@apps/nine-lives/types';

export function startIngestionDraftsListener(
  householdId: string,
  onChange: (drafts: IngestionDraft[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const draftsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'ingestionDrafts'),
  );

  return createFirestoreCollectionListener<IngestionDraft>({
    query: draftsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<IngestionDraft, 'id'>),
    }),
    onData: onChange,
  });
}
