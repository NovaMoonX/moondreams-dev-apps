import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Expense } from '@apps/nine-lives/types';

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
