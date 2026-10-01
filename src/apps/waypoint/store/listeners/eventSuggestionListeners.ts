import {
  collection,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { EventSuggestion } from '@apps/waypoint/types';

export function startEventSuggestionsListener(
  tripId: string | null,
  onChange: (suggestions: EventSuggestion[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, 'apps', 'waypoint', 'trips', tripId, 'eventSuggestions')),
    (snapshot) => {
      const suggestions = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<EventSuggestion, 'id'>),
      }));
      onChange(suggestions);
    },
    () => onChange([]),
  );
}
