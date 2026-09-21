import {
  collection,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { ChecklistItem } from '@apps/waypoint/types';

export function startChecklistListener(
  tripId: string | null,
  onChange: (items: ChecklistItem[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, 'apps', 'waypoint', 'trips', tripId, 'checklist')),
    (snapshot) => {
      const items = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<ChecklistItem, 'id'>),
      }));
      onChange(items);
    },
    () => onChange([]),
  );
}
