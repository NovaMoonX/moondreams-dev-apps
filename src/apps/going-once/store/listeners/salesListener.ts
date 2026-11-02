import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { toSale } from '@apps/going-once/store/listeners/toSale';
import type { Sale } from '@apps/going-once/types';

/** Every sale the person is in, as the seller or a co-seller. */
export function startSalesListener(
  uid: string,
  onChange: (sales: Sale[]) => void,
  onError: () => void,
): Unsubscribe {
  const salesQuery = query(
    collection(db, 'apps', 'going-once', 'sales'),
    where('members', 'array-contains', uid),
  );

  return onSnapshot(
    salesQuery,
    (snapshot) =>
      onChange(
        snapshot.docs.map((docSnapshot) =>
          toSale(docSnapshot.id, docSnapshot.data()),
        ),
      ),
    onError,
  );
}
