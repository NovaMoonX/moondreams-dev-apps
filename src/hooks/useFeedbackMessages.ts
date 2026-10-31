import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@lib/firebase/config';
import type { FeedbackMessage } from '@lib/feedback/types';

interface Loaded {
  feedbackId: string;
  messages: FeedbackMessage[] | null;
}

/** One feedback's thread, live and oldest first; `loading` until the open feedback's first snapshot. */
export function useFeedbackMessages(feedbackId: string | null): {
  messages: FeedbackMessage[];
  status: 'loading' | 'ready' | 'error';
} {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (feedbackId === null) return;
    return onSnapshot(
      query(
        collection(db, 'feedback', feedbackId, 'messages'),
        orderBy('createdAt', 'asc'),
      ),
      (snapshot) =>
        setLoaded({
          feedbackId,
          messages: snapshot.docs.map(
            (docSnap) =>
              ({ ...docSnap.data(), id: docSnap.id }) as FeedbackMessage,
          ),
        }),
      (error) => {
        console.error('Failed to load the conversation:', error);
        setLoaded({ feedbackId, messages: null });
      },
    );
  }, [feedbackId]);

  if (loaded === null || loaded.feedbackId !== feedbackId) {
    return { messages: [], status: 'loading' };
  }
  return loaded.messages === null
    ? { messages: [], status: 'error' }
    : { messages: loaded.messages, status: 'ready' };
}
