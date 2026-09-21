import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TripExpense } from '@apps/waypoint/types';

export function startTripExpensesListener(
  tripId: string | null,
  onChange: (expenses: TripExpense[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    collection(db, 'apps', 'waypoint', 'trips', tripId, 'expenses'),
    (snapshot) => {
      const expenses = snapshot.docs.map((expenseSnapshot) => {
        const data = expenseSnapshot.data() as Omit<TripExpense, 'id'>;
        return { id: expenseSnapshot.id, ...data };
      });
      onChange(expenses);
    },
    () => onChange([]),
  );
}
