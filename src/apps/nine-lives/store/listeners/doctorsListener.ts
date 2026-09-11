import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { Doctor } from '@apps/nine-lives/types';

export function startDoctorsListener(
  householdId: string,
  onChange: (doctors: Doctor[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const doctorsQuery = query(
    collection(db, 'apps', 'nine-lives', 'households', householdId, 'doctors'),
  );

  return createFirestoreCollectionListener<Doctor>({
    query: doctorsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Doctor, 'id'>),
    }),
    onData: onChange,
  });
}
