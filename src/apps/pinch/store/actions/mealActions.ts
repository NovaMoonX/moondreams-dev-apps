import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { stopSharingDeleted } from '@apps/pinch/store/actions/shareActions';
import type { DishCategory, ItemKind, Meal } from '@apps/pinch/types';

const mealDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'meals', id);

interface DraftItem {
  /** Kept on an edit so a row keeps its id; a new row gets one. */
  id?: string;
  kind: ItemKind;
  refId: string;
  servings: number;
}

const toItems = (items: DraftItem[]) =>
  items.map((item) => ({
    id: item.id ?? generateUuid(),
    kind: item.kind,
    refId: item.refId,
    servings: item.servings,
  }));

interface SaveMealInput {
  uid: string;
  /** The meal being changed; null saves a new one. */
  id: string | null;
  name: string;
  categories: DishCategory[];
  items: DraftItem[];
}

/** An edit never writes `isFavorite`: only the star owns it. */
export const saveMeal = createAsyncThunk<
  string,
  SaveMealInput,
  { rejectValue: string }
>(
  'pinch/meals/save',
  async ({ uid, id, name, categories, items }, { rejectWithValue }) => {
    const now = Date.now();
    const mealId = id ?? generateUuid();

    try {
      if (id) {
        await updateDoc(mealDoc(uid, id), {
          name: name.trim(),
          categories,
          items: toItems(items),
          updatedAt: now,
        });
      } else {
        const meal: Meal = {
          id: mealId,
          name: name.trim(),
          categories,
          items: toItems(items),
          isFavorite: false,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(mealDoc(uid, mealId), meal);
      }
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this meal.'),
      );
    }

    return mealId;
  },
);

interface SetMealFavoriteInput {
  uid: string;
  id: string;
  isFavorite: boolean;
}

/** Writes the value asked for, never a toggle read from a cache, and leaves `updatedAt` alone: a shared link compares it to say the meal changed, and a star is not shared. */
export const setMealFavorite = createAsyncThunk<
  void,
  SetMealFavoriteInput,
  { rejectValue: string }
>(
  'pinch/meals/setFavorite',
  async ({ uid, id, isFavorite }, { rejectWithValue }) => {
    try {
      await updateDoc(mealDoc(uid, id), { isFavorite });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to change this star.'),
      );
    }
  },
);

interface RemoveMealInput {
  uid: string;
  id: string;
}

/** A saved meal is always deletable: planned days hold their own copy and nothing reads `sourceMealId`. Its shared link is taken down after the delete has committed. */
export const removeMeal = createAsyncThunk<
  string,
  RemoveMealInput,
  { state: RootState; rejectValue: string }
>('pinch/meals/remove', async ({ uid, id }, { getState, rejectWithValue }) => {
  try {
    await deleteDoc(mealDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to delete this meal.'),
    );
  }

  stopSharingDeleted(getState(), 'MEAL', id);

  return id;
});

interface SavePlannedAsMealInput {
  uid: string;
  plannedMealId: string;
  name: string;
}

/** Saves a planned meal's items as a new meal; reads the planned meal from the store at tap time and leaves it, and any saved meal it came from, as they were. */
export const savePlannedAsMeal = createAsyncThunk<
  string,
  SavePlannedAsMealInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/meals/savePlanned',
  async ({ uid, plannedMealId, name }, { getState, rejectWithValue }) => {
    const planned = getState().pinch.plannedMeals.items.find(
      (candidate) => candidate.id === plannedMealId,
    );
    if (!planned) {
      return rejectWithValue('This meal is no longer on its day.');
    }

    const now = Date.now();
    const id = generateUuid();
    const meal: Meal = {
      id,
      name: name.trim(),
      items: toItems(
        planned.items.map((item) => ({
          kind: item.kind,
          refId: item.refId,
          servings: item.servings,
        })),
      ),
      categories: [],
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(mealDoc(uid, id), meal);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this meal.'),
      );
    }

    return id;
  },
);
