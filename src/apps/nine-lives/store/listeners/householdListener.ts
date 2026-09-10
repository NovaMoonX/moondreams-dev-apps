import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Household } from '@apps/nine-lives/types';

export function startHouseholdListener(
  uid: string,
  onChange: (households: Household[]) => void,
): Unsubscribe {
  if (!uid) {
    onChange([]);
    return () => undefined;
  }

  const householdQuery = query(
    collection(db, 'apps', 'nine-lives', 'households'),
    where('members', 'array-contains', uid),
  );

  return onSnapshot(
    householdQuery,
    (snapshot) => {
      const households = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<Household, 'id'>),
      }));

      onChange(households);
    },
    () => {
      onChange([]);
    },
  );
}
