import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@lib/firebase/config';
import type { Feedback } from '@lib/feedback/types';

const ALL_FEEDBACK_LIMIT = 300;

/** Every feedback, newest activity first, live because the admin edits them. Admin only: pass `isEnabled` false for anyone else. */
export function useAllFeedback(isEnabled: boolean): {
  items: Feedback[];
  status: 'loading' | 'ready' | 'error';
} {
  const [loaded, setLoaded] = useState<{ items: Feedback[] | null } | null>(
    null,
  );

  useEffect(() => {
    if (!isEnabled) return;
    return onSnapshot(
      query(
        collection(db, 'feedback'),
        orderBy('lastActivityAt', 'desc'),
        limit(ALL_FEEDBACK_LIMIT),
      ),
      (snapshot) =>
        setLoaded({
          items: snapshot.docs.map(
            (docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as Feedback,
          ),
        }),
      (error) => {
        console.error('Failed to load feedback:', error);
        setLoaded({ items: null });
      },
    );
  }, [isEnabled]);

  if (!isEnabled || loaded === null) return { items: [], status: 'loading' };
  return loaded.items === null
    ? { items: [], status: 'error' }
    : { items: loaded.items, status: 'ready' };
}
