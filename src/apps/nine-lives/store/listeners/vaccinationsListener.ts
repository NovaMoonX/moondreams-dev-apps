import { collection, query, type Unsubscribe } from 'firebase/firestore';

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

  const vaccinationsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'vaccinations'),
  );

  return createFirestoreCollectionListener<Vaccination>({
    query: vaccinationsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Vaccination, 'id'>),
    }),
    onData: onChange,
  });
}
