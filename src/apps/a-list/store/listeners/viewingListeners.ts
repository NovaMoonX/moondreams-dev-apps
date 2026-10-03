import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Viewing } from '@apps/a-list/types';

export function startViewingsListener(
  uid: string,
  onChange: (viewings: Viewing[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const viewingsRef = collection(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'viewings',
  );

  return onSnapshot(
    viewingsRef,
    (snapshot) => {
      const viewings = snapshot.docs.map(
        (viewingSnapshot) => viewingSnapshot.data() as Viewing,
      );
      onChange(viewings);
    },
    onError,
  );
}
