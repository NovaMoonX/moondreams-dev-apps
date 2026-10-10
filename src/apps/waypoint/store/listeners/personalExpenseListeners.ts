import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { PersonalExpense } from '@apps/waypoint/types';

export function startPersonalExpensesListener(
  uid: string | null,
  tripId: string | null,
  onChange: (expenses: PersonalExpense[]) => void,
): Unsubscribe {
  if (!uid || !tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    query(
      collection(db, 'apps', 'waypoint', 'personalExpenses', uid, 'items'),
      where('tripId', '==', tripId),
    ),
    (snapshot) => {
      const expenses = snapshot.docs.map(
        (expenseSnapshot) =>
          ({ ...expenseSnapshot.data(), id: expenseSnapshot.id }) as PersonalExpense,
      );
      onChange(expenses);
    },
    () => onChange([]),
  );
}
