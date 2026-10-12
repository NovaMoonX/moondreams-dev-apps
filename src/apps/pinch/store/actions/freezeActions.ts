import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  selectCostContext,
  selectIsPinchLoaded,
  selectPinchLoadError,
  selectPlannedMeals,
} from '@apps/pinch/store/selectors';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';
import { buildSnapshot } from '@apps/pinch/utils/mealMath';

/** Writes `snapshot` on every loaded planned meal whose day has passed and that hasn't been frozen, from the data as it is now. Returns how many it froze. */
export async function freezeLoadedPastMeals(
  uid: string,
  state: RootState,
  now = Date.now(),
): Promise<number> {
  if (!selectIsPinchLoaded(state) || selectPinchLoadError(state) !== null) {
    return 0;
  }

  const today = getLocalTodayDate(now);
  const context = selectCostContext(state);
  const due = selectPlannedMeals(state).filter(
    (meal) => meal.snapshot === null && meal.date < today,
  );
  if (due.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  due.forEach((meal) =>
    batch.update(
      doc(db, 'apps', 'pinch', 'kitchens', uid, 'plannedMeals', meal.id),
      { snapshot: buildSnapshot(meal.items, context, now) },
    ),
  );
  await batch.commit();

  return due.length;
}

interface FreezePastMealsInput {
  uid: string;
}

export const freezePastMeals = createAsyncThunk<
  number,
  FreezePastMealsInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/plannedMeals/freeze',
  async ({ uid }, { getState, rejectWithValue }) => {
    try {
      return await freezeLoadedPastMeals(uid, getState());
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to keep past days as they were.'),
      );
    }
  },
);
