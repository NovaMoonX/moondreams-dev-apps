import { collection, query, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { CustomPreventiveProduct } from '@apps/nine-lives/types';

export function startCustomPreventiveProductsListener(
  householdId: string,
  onChange: (products: CustomPreventiveProduct[]) => void,
): Unsubscribe {
  if (!householdId) {
    onChange([]);
    return () => undefined;
  }

  const productsQuery = query(
    collection(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'customPreventiveProducts',
    ),
  );

  return createFirestoreCollectionListener<CustomPreventiveProduct>({
    query: productsQuery,
    normalize: (id, data) => ({
      id,
      ...(data as Omit<CustomPreventiveProduct, 'id'>),
    }),
    onData: onChange,
  });
}
