import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CatCondition, Symptom } from '@apps/nine-lives/types';

export function startCatConditionsListener(
  householdId: string,
  onChange: (conditions: CatCondition[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const catConditionsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'conditions'),
  );

  return createFirestoreCollectionListener<CatCondition>({
    query: catConditionsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CatCondition, 'id'>),
    }),
    onData: onChange,
  });
}

export function startSymptomsListener(
  householdId: string,
  onChange: (symptoms: Symptom[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const symptomsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'symptoms'),
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
