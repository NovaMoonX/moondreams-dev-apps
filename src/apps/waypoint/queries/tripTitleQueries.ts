import { queryOptions } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

export const waypointQueryKeys = {
  all: ['waypoint'] as const,
  tripTitle: (tripId: string) => [...waypointQueryKeys.all, 'tripTitle', tripId] as const,
};

/** A pending requester can't read the trip doc itself, only its invite code, which carries the title. */
export function tripTitleQueryOptions(tripId: string) {
  return queryOptions({
    queryKey: waypointQueryKeys.tripTitle(tripId),
    queryFn: async () => {
      const snapshot = await getDocs(
        query(collection(db, 'apps', 'waypoint', 'inviteCodes'), where('tripId', '==', tripId)),
      );
      const title = snapshot.docs[0]?.data().title;
      return typeof title === 'string' ? title : null;
    },
  });
}
