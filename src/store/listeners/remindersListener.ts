import { collection, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Reminder } from '@/lib/notifications/types';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';

/** Central, app-wide: every reminder targeting the signed-in user, across every mini-app. */
export function startRemindersListener(
  uid: string,
  onChange: (reminders: Reminder[]) => void,
): Unsubscribe {
  if (!uid) {
    onChange([]);
    return () => undefined;
  }

  const remindersQuery = query(
    collection(db, 'reminders'),
    where('targetUids', 'array-contains', uid),
  );

  return createFirestoreCollectionListener<Reminder>({
    query: remindersQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<Reminder, 'id'>),
    }),
    onData: onChange,
  });
}
