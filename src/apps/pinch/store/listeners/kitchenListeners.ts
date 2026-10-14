import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  Cook,
  Family,
  Idea,
  IngredientRecord,
  KitchenSettings,
  Meal,
  PlannedMeal,
  Product,
  Recipe,
  RecipeNote,
  ShoppingItem,
  Source,
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

export function startSourcesListener(
  uid: string,
  onChange: (sources: Source[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'sources'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Source)),
    onError,
  );
}

export function startShoppingListener(
  uid: string,
  onChange: (items: ShoppingItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'shoppingItems'),
    (snapshot) =>
      onChange(
        snapshot.docs.map((document) => document.data() as ShoppingItem),
      ),
    onError,
  );
}

export function startIdeasListener(
  uid: string,
  onChange: (ideas: Idea[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'ideas'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Idea)),
    onError,
  );
}

export function startCooksListener(
  uid: string,
  onChange: (cooks: Cook[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'cooks'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Cook)),
    onError,
  );
}

export function startNotesListener(
  uid: string,
  onChange: (notes: RecipeNote[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'notes'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as RecipeNote)),
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

/** The planned meals whose day falls in `[start, end)`, both stored dates (UTC midnight). */
export function startPlannedMealsListener(
  uid: string,
  window: { start: number; end: number },
  onChange: (plannedMeals: PlannedMeal[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      kitchenCollection(uid, 'plannedMeals'),
      where('date', '>=', window.start),
      where('date', '<', window.end),
    ),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as PlannedMeal)),
    onError,
  );
}

export function startMealsListener(
  uid: string,
  onChange: (meals: Meal[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kitchenCollection(uid, 'meals'),
    (snapshot) =>
      onChange(snapshot.docs.map((document) => document.data() as Meal)),
    onError,
  );
}
