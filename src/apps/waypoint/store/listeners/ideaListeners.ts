import {
  collection,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TripIdea } from '@apps/waypoint/types';

export function startIdeasListener(
  tripId: string | null,
  onChange: (ideas: TripIdea[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, 'apps', 'waypoint', 'trips', tripId, 'ideas')),
    (snapshot) => {
      const ideas = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<TripIdea, 'id'>),
      }));
      onChange(ideas);
    },
    () => onChange([]),
  );
}
