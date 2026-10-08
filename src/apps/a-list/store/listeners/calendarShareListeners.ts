import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { CalendarShare } from '@apps/a-list/types';

export function startCalendarSharesListener(
  uid: string,
  onChange: (shares: CalendarShare[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sharesQuery = query(
    collection(db, 'apps', 'a-list', 'calendarShares'),
    where('ownerUid', '==', uid),
  );

  return onSnapshot(
    sharesQuery,
    (snapshot) => {
      const shares = snapshot.docs.map(
        (shareSnapshot) => shareSnapshot.data() as CalendarShare,
      );
      onChange(shares);
    },
    onError,
  );
}
