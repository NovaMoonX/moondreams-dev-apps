import { collection, onSnapshot, query, orderBy, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TimelineEvent } from '@apps/waypoint/types';

export function startTripEventsListener(
  tripId: string | null,
  onChange: (events: TimelineEvent[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  const eventsQuery = query(
    collection(db, 'apps', 'waypoint', 'trips', tripId, 'events'),
    orderBy('startAt'),
  );

  return onSnapshot(
    eventsQuery,
    (snapshot) => {
      const events = snapshot.docs.map((eventSnapshot) => ({
        id: eventSnapshot.id,
        ...(eventSnapshot.data() as Omit<TimelineEvent, 'id'>),
      }));
      onChange(events);
    },
    () => onChange([]),
  );
}
