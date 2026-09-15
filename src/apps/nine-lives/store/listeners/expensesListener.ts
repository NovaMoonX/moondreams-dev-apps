import { collectionGroup, query, type Unsubscribe, where } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Expense } from '@apps/nine-lives/types';

export function startExpensesListener(
  householdId: string,
  onChange: (expenses: Expense[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const expensesQuery = query(
    collectionGroup(db, 'expenses'),
    where('householdId', '==', householdId),
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
