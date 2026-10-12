import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, runTransaction, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import type {
  ItemKind,
  MealItem,
  MealType,
  PlannedMeal,
} from '@apps/pinch/types';
import { selectCostContext } from '@apps/pinch/store/selectors';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';
import { buildSnapshot } from '@apps/pinch/utils/mealMath';

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

/** Writes a new planned meal with its own copy of the items; a meal for a day that has already passed is frozen in the same write. */
export const planMeal = createAsyncThunk<
  string,
  PlanMealInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/plannedMeals/plan',
  async (
    { uid, date, mealType, items, name, sourceMealId },
    { getState, rejectWithValue },
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
      snapshot:
        date < getLocalTodayDate(now)
          ? buildSnapshot(rows, selectCostContext(getState()), now)
          : null,
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

interface UpdatePlannedMealInput {
  uid: string;
  id: string;
  date: number;
  mealType: MealType;
  items: MealItem[];
}

/** Changes what the builder owns (day, type, items) and nothing else, so a concurrent change to anything else on the document survives. A frozen meal is refused: its snapshot would no longer match its items. */
export const updatePlannedMeal = createAsyncThunk<
  string,
  UpdatePlannedMealInput,
  { rejectValue: string }
>(
  'pinch/plannedMeals/update',
  async ({ uid, id, date, mealType, items }, { rejectWithValue }) => {
    try {
      await runTransaction(db, async (transaction) => {
        const ref = plannedMealDoc(uid, id);
        const current = await transaction.get(ref);
        if (current.exists() && current.data().snapshot != null) {
          throw new Error(
            'That day has passed, so this meal is fixed. Remove it and add it again to change it.',
          );
        }

        transaction.update(ref, {
          date,
          mealType,
          items,
          refIds: Array.from(new Set(items.map((item) => item.refId))),
          updatedAt: Date.now(),
        });
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this meal.'),
      );
    }

    return id;
  },
);
