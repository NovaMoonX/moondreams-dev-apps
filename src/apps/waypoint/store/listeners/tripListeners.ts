import {
  collection,
  FieldPath,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TripSpace } from '@apps/waypoint/types';

export function startTripListener(
  uid: string,
  onChange: (trips: TripSpace[]) => void,
): Unsubscribe {
  if (!uid) {
    onChange([]);
    return () => undefined;
  }

  const tripsQuery = query(
    collection(db, 'apps', 'waypoint', 'trips'),
    where(new FieldPath('members', uid, 'uid'), '==', uid),
  );

  return onSnapshot(
    tripsQuery,
    (snapshot) => {
      const trips = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<TripSpace, 'id'>),
      }));

      onChange(trips);
    },
    () => {
      onChange([]);
    },
  );
}
