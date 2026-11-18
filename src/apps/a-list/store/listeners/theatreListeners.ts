import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { WithId } from '@apps/a-list/store/heldLists';
import type { AListTheatre } from '@apps/a-list/types';

export function startTheatresListener(
  uid: string,
  onChange: (theatres: WithId<AListTheatre>[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const theatresRef = collection(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'theatres',
  );

  return onSnapshot(
    theatresRef,
    (snapshot) => {
      const theatres = snapshot.docs.map(
        (theatreSnapshot) =>
          ({
            ...theatreSnapshot.data(),
            id: theatreSnapshot.id,
          }) as WithId<AListTheatre>,
      );
      onChange(theatres);
    },
    onError,
  );
}
