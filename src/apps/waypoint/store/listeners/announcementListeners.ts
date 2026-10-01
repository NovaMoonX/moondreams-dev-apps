import {
  collection,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Announcement } from '@apps/waypoint/types';

export function startAnnouncementsListener(
  tripId: string | null,
  onChange: (announcements: Announcement[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, 'apps', 'waypoint', 'trips', tripId, 'announcements')),
    (snapshot) => {
      const announcements = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<Announcement, 'id'>),
      }));
      onChange(announcements);
    },
    () => onChange([]),
  );
}
