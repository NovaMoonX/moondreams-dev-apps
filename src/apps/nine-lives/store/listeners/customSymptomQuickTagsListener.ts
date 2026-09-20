import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CustomSymptomQuickTag } from '@apps/nine-lives/types';

export function startCustomSymptomQuickTagsListener(
  householdId: string,
  onChange: (tags: CustomSymptomQuickTag[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const quickTagsQuery = query(
    collection(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'customSymptomQuickTags',
    ),
  );

  return createFirestoreCollectionListener<CustomSymptomQuickTag>({
    query: quickTagsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CustomSymptomQuickTag, 'id'>),
    }),
    onData: onChange,
  });
}
