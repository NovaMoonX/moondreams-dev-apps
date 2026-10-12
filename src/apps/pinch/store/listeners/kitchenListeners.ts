import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Family, IngredientRecord } from '@apps/pinch/types';

const kitchenCollection = (uid: string, name: string) =>
  collection(db, 'apps', 'pinch', 'kitchens', uid, name);

export function startIngredientsListener(
  uid: string,
  onChange: (records: IngredientRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'ingredients'),
    (snapshot) =>
      onChange(
        snapshot.docs.map((document) => document.data() as IngredientRecord),
      ),
    onError,
  );
}

export function startFamiliesListener(
  uid: string,
  onChange: (families: Family[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'families'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Family)),
    onError,
  );
}
