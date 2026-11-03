import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import { toSale } from '@apps/going-once/store/listeners/toSale';
import type { Item, Sale } from '@apps/going-once/types';

export const isPermissionDenied = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'permission-denied';

/** Whether the sale document is still readable by this person; a failed check that isn't a refusal counts as readable. */
export const canReadSale = (saleId: string): Promise<boolean> =>
  getDoc(doc(db, 'apps', 'going-once', 'sales', saleId)).then(
    () => true,
    (error) => !isPermissionDenied(error),
  );

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
