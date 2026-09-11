import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { VetClinic } from '@apps/nine-lives/types';

export function startVetClinicsListener(
  householdId: string,
  onChange: (vetClinics: VetClinic[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const vetClinicsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'vetClinics'),
  );

  return createFirestoreCollectionListener<VetClinic>({
    query: vetClinicsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<VetClinic, 'id'>),
    }),
    onData: onChange,
  });
}
