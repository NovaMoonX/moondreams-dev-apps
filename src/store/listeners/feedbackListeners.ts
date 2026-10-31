import {
  collection,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Feedback } from '@/lib/feedback/types';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';

const normalize = (id: string, data: unknown): Feedback => ({
  ...(data as Feedback),
  id,
});

/** Everything the signed-in person has sent, newest activity first. */
export function startMyFeedbackListener(
  uid: string,
  onChange: (feedback: Feedback[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<Feedback>({
    query: query(
      collection(db, 'feedback'),
      where('uid', '==', uid),
      orderBy('lastActivityAt', 'desc'),
    ),
    normalize,
    onData: onChange,
    onError,
  });
}

/** The feedback the admin hasn't seen; only the count is kept. Admin only. */
export function startAdminUnreadFeedbackListener(
  onChange: (count: number) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<Feedback>({
    query: query(
      collection(db, 'feedback'),
      where('isUnreadByAdmin', '==', true),
    ),
    normalize,
    onData: (items) => onChange(items.length),
    onError,
  });
}
