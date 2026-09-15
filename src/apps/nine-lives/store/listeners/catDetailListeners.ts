import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CatCondition, Expense, Symptom } from '@apps/nine-lives/types';

export function startCatConditionsListener(
  householdId: string,
  catId: string,
  onChange: (conditions: CatCondition[]) => void,
): Unsubscribe {
  if (!householdId || !catId) {
    onChange([]);
    return () => undefined;
  }

  const catConditionsQuery = query(
    collection(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'cats',
      catId,
      'conditions',
    ),
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

export function startExpensesListener(
  householdId: string,
  catId: string,
  onChange: (expenses: Expense[]) => void,
): Unsubscribe {
  if (!householdId || !catId) {
    onChange([]);
    return () => undefined;
  }

  const expensesQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'cats', catId, 'expenses'),
  );

  return createFirestoreCollectionListener<Expense>({
    query: expensesQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Expense, 'id'>),
    }),
    onData: onChange,
  });
}
