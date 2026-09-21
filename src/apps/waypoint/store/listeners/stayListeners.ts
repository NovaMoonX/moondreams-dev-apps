import { collection, onSnapshot, query, orderBy, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Stay } from '@apps/waypoint/types';

export function startTripStaysListener(
  tripId: string | null,
  onChange: (stays: Stay[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  const staysQuery = query(
    collection(db, 'apps', 'waypoint', 'trips', tripId, 'stays'),
    orderBy('plannedArrivalAt'),
  );

  return onSnapshot(
    staysQuery,
    (snapshot) => {
      const stays = snapshot.docs.map((staySnapshot) => ({
        id: staySnapshot.id,
        ...(staySnapshot.data() as Omit<Stay, 'id'>),
      }));
      onChange(stays);
    },
    () => onChange([]),
  );
}
