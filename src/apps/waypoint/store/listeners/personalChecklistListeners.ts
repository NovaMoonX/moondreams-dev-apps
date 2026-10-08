import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { ChecklistItem } from '@apps/waypoint/types';

export function startPersonalChecklistListener(
  uid: string | null,
  tripId: string | null,
  onChange: (items: ChecklistItem[]) => void,
): Unsubscribe {
  if (!uid || !tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, 'apps', 'waypoint', 'personalChecklist', uid, 'items'), where('tripId', '==', tripId)),
    (snapshot) => {
      const items = snapshot.docs.map(
        (itemSnapshot) => ({ ...itemSnapshot.data(), id: itemSnapshot.id }) as ChecklistItem,
      );
      onChange(items);
    },
    () => onChange([]),
  );
}
