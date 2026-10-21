import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import type { ItemKind, MealType, PlannedMeal } from '@apps/pinch/types';

const plannedMealDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'plannedMeals', id);

export interface PlanMealInput {
  uid: string;
  /** UTC midnight of the day (`fromDateInputValue`). */
  date: number;
  mealType: MealType;
  items: { kind: ItemKind; refId: string; servings: number }[];
  name: string | null;
  sourceMealId: string | null;
}

/** Writes a new planned meal with its own copy of the items. */
export const planMeal = createAsyncThunk<
  string,
  PlanMealInput,
  { rejectValue: string }
>(
  'pinch/plannedMeals/plan',
  async (
    { uid, date, mealType, items, name, sourceMealId },
    { rejectWithValue },
  ) => {
    const now = Date.now();
    const id = generateUuid();
    const rows = items.map((item) => ({ id: generateUuid(), ...item }));
    const plannedMeal: PlannedMeal = {
      id,
      date,
      mealType,
      name,
      sourceMealId,
      items: rows,
      refIds: Array.from(new Set(rows.map((row) => row.refId))),
      snapshot: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(plannedMealDoc(uid, id), plannedMeal);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to plan this meal.'),
      );
    }

    return id;
  },
);

interface RemovePlannedMealInput {
  uid: string;
  id: string;
}

export const removePlannedMeal = createAsyncThunk<
  string,
  RemovePlannedMealInput,
  { rejectValue: string }
>('pinch/plannedMeals/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(plannedMealDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to remove this meal.'),
    );
  }

  return id;
});
