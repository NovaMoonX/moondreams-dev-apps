import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { HealthRecord } from '@apps/nine-lives/types';

export function startHealthRecordsListener(
  householdId: string,
  onChange: (records: HealthRecord[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const healthRecordsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'healthRecords'),
  );

  return createFirestoreCollectionListener<HealthRecord>({
    query: healthRecordsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<HealthRecord, 'id'>),
    }),
    onData: onChange,
  });
}
