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

/** Every thing in the sale on screen. */
export function startOpenSaleItemsListener(
  saleId: string,
  onChange: (items: Item[]) => void,
  onError: () => void,
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
