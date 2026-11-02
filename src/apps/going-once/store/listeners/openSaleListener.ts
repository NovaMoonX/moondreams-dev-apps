import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { toSale } from '@apps/going-once/store/listeners/toSale';
import type { Sale } from '@apps/going-once/types';

/** The sale on screen. A sale that is gone or that you left arrives as an error, since the read rule needs the document. */
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
