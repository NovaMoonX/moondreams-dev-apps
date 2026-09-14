import { collectionGroup, query, type Unsubscribe, where } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Vaccination } from '@apps/nine-lives/types';

export function startVaccinationsListener(
  householdId: string,
  onChange: (vaccinations: Vaccination[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const vaccinationQuery = query(
    collectionGroup(db, 'vaccinations'),
    where('householdId', '==', householdId),
  );

  return createFirestoreCollectionListener<Vaccination>({
    query: vaccinationQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Vaccination, 'id'>),
    }),
    onData: onChange,
  });
}
