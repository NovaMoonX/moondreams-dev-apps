import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import { toSale } from '@apps/going-once/store/listeners/toSale';
import type { Item, Sale } from '@apps/going-once/types';

/** The sale on screen. A sale that is gone or that you left arrives as an error, since the read rule needs the document. */
export function startOpenSaleListener(
  saleId: string,
  onChange: (sale: Sale | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'going-once', 'sales', saleId),
    (snapshot) =>
      onChange(snapshot.exists() ? toSale(snapshot.id, snapshot.data()) : null),
    onError,
  );
}

/** Every thing in the sale on screen. */
export function startOpenSaleItemsListener(
  saleId: string,
  onChange: (items: Item[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'apps', 'going-once', 'sales', saleId, 'items'),
    (snapshot) =>
      onChange(
        snapshot.docs.map((docSnapshot) =>
          toItem(docSnapshot.id, saleId, docSnapshot.data()),
        ),
      ),
    onError,
  );
}
