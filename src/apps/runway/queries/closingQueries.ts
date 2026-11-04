import { queryOptions } from '@tanstack/react-query';
import { getDocsFromServer, orderBy, query, where } from 'firebase/firestore';

import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  closingsCollection,
  openClosing,
} from '@apps/runway/store/listeners/closingListeners';
import type { ClosingDoc } from '@apps/runway/types';

export interface ClosingsKey {
  uid: string;
  /** The month the newest valid closing covers; a newer one or a rebuild changes the key. */
  throughMonth: string;
  dirtyFrom: string | null;
}

/** Every closing through `throughMonth`, opened, oldest first: the month ends a long money history reads. Held for the visit and never persisted. */
export function closingsQueryOptions({
  uid,
  throughMonth,
  dirtyFrom,
}: ClosingsKey) {
  return queryOptions({
    queryKey: ['runway', 'closings', uid, throughMonth, dirtyFrom] as const,
    queryFn: async () => {
      const encryption = await getRunwayEncryption(uid);
      const snapshot = await getDocsFromServer(
        query(
          closingsCollection(uid),
          where('month', '<=', throughMonth),
          orderBy('month', 'asc'),
        ),
      );
      const result = await Promise.all(
        snapshot.docs.map((entry) =>
          openClosing(
            { ...(entry.data() as ClosingDoc), id: entry.id },
            encryption,
          ),
        ),
      );
      return result;
    },
    staleTime: Infinity,
    retry: 1,
  });
}
