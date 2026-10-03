import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { WatchlistItem } from '@apps/a-list/types';

export function startWatchlistListener(
  uid: string,
  onChange: (items: WatchlistItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const watchlistRef = collection(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'watchlist',
  );

  return onSnapshot(
    watchlistRef,
    (snapshot) => {
      const items = snapshot.docs.map(
        (itemSnapshot) => itemSnapshot.data() as WatchlistItem,
      );
      onChange(items);
    },
    onError,
  );
}
