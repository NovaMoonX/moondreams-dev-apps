import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  Family,
  IngredientRecord,
  KitchenSettings,
  Product,
  Recipe,
  Store,
} from '@apps/pinch/types';

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

export function startStoresListener(
  uid: string,
  onChange: (stores: Store[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'stores'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Store)),
    onError,
  );
}

export function startProductsListener(
  uid: string,
  onChange: (products: Product[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'products'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Product)),
    onError,
  );
}

export function startRecipesListener(
  uid: string,
  onChange: (recipes: Recipe[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'recipes'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Recipe)),
    onError,
  );
}

export function startSettingsListener(
  uid: string,
  onChange: (settings: KitchenSettings | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'pinch', 'kitchens', uid),
    (snapshot) =>
      onChange(snapshot.exists() ? (snapshot.data() as KitchenSettings) : null),
    onError,
  );
}
