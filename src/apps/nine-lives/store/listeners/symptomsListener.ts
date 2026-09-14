import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Symptom } from '@apps/nine-lives/types';

export function startSymptomsListener(
  householdId: string,
  catId: string,
  onChange: (symptoms: Symptom[]) => void,
): Unsubscribe {
  if (!householdId || !catId) {
    onChange([]);
    return () => undefined;
  }

  const symptomsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'cats', catId, 'symptoms'),
  );

  return createFirestoreCollectionListener<Symptom>({
    query: symptomsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Symptom, 'id'>),
    }),
    onData: onChange,
  });
}
