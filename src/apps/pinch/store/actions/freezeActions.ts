import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, updateDoc } from 'firebase/firestore';

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

/** Whether every collection the cost math reads has loaded without a failure, so a snapshot taken now isn't built from partial data. */
export const hasCompleteCostData = (state: RootState) =>
  selectIsPinchLoaded(state) && selectPinchLoadError(state) === null;

/** Writes `snapshot` on every loaded planned meal whose day has passed and that hasn't been frozen, from the data as it is now. Each meal is its own write, so one that another device froze first or deleted doesn't stop the rest. Returns how many it froze. */
export async function freezeLoadedPastMeals(
  uid: string,
  state: RootState,
  now = Date.now(),
): Promise<number> {
  if (!hasCompleteCostData(state)) {
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

  const results = await Promise.allSettled(
    due.map((meal) =>
      updateDoc(
        doc(db, 'apps', 'pinch', 'kitchens', uid, 'plannedMeals', meal.id),
        { snapshot: buildSnapshot(meal.items, context, now) },
      ),
    ),
  );
  const frozen = results.filter((result) => result.status === 'fulfilled');

  return frozen.length;
}

/** The step before an edit that moves a price or a recipe. A freeze that fails never stops the person's own edit; those meals just stay open until the next one. */
export const freezeBeforeEdit = (uid: string, state: RootState) =>
  freezeLoadedPastMeals(uid, state).catch(() => 0);

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
