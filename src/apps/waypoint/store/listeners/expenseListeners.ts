import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TripExpense } from '@apps/waypoint/types';

// Expenses written before these fields existed lack the keys, and an absent
// groupLabel reads as undefined rather than the null the UI relies on.
function normalizeExpense(id: string, data: Partial<TripExpense>): TripExpense {
  const expense = {
    ...data,
    id,
    category: data.category ?? 'OTHER',
    customCategoryLabel: data.customCategoryLabel ?? null,
    note: data.note ?? null,
    groupLabel: data.groupLabel ?? null,
    isPerPerson: data.isPerPerson ?? false,
  } as TripExpense;
  return expense;
}

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
      const expenses = snapshot.docs.map((expenseSnapshot) =>
        normalizeExpense(expenseSnapshot.id, expenseSnapshot.data() as Partial<TripExpense>),
      );
      onChange(expenses);
    },
    () => onChange([]),
  );
}
