import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { toSale } from '@apps/going-once/store/listeners/toSale';
import type { Sale } from '@apps/going-once/types';

/** The sale on screen; `null` when it no longer exists. */
export function startOpenSaleListener(
  saleId: string,
  onChange: (sale: Sale | null) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'going-once', 'sales', saleId),
    (snapshot) =>
      onChange(snapshot.exists() ? toSale(snapshot.id, snapshot.data()) : null),
    onError,
  );
}
