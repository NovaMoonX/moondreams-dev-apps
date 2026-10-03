import { collection, onSnapshot, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Rental } from '@apps/waypoint/types';

export function startTripRentalsListener(
  tripId: string | null,
  onChange: (rentals: Rental[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  const rentalsQuery = query(collection(db, 'apps', 'waypoint', 'trips', tripId, 'rentals'));

  return onSnapshot(
    rentalsQuery,
    (snapshot) => {
      const rentals = snapshot.docs.map((rentalSnapshot) => ({
        id: rentalSnapshot.id,
        ...(rentalSnapshot.data() as Omit<Rental, 'id'>),
      }));
      onChange(rentals);
    },
    () => onChange([]),
  );
}
