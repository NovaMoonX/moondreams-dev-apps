import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { PlannedMeal } from '@apps/pinch/types';
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

const FREEZE_BATCH_SIZE = 100;

const mealRef = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'plannedMeals', id);

/** One batch is one snapshot event for the listeners, where a write per meal is one each and a month of them stalls the page. A batch that is refused (a meal another device froze first, or deleted) falls back to a write per meal so the rest still land. Returns how many were written. */
async function freezeChunk(
  uid: string,
  meals: { meal: PlannedMeal; snapshot: PlannedMeal['snapshot'] }[],
): Promise<number> {
  try {
    const batch = writeBatch(db);
    meals.forEach(({ meal, snapshot }) =>
      batch.update(mealRef(uid, meal.id), { snapshot }),
    );
    await batch.commit();
    return meals.length;
  } catch {
    const results = await Promise.allSettled(
      meals.map(({ meal, snapshot }) =>
        updateDoc(mealRef(uid, meal.id), { snapshot }),
      ),
    );
    return results.filter((result) => result.status === 'fulfilled').length;
  }
}

/** Writes `snapshot` on every loaded planned meal whose day has passed and that hasn't been frozen, from the data as it is now. Returns how many it froze. */
export async function freezeLoadedPastMeals(
  uid: string,
  state: RootState,
  now = Date.now(),
  onlyIds: Set<string> | null = null,
): Promise<number> {
  if (!hasCompleteCostData(state)) {
    return 0;
  }

  const today = getLocalTodayDate(now);
  const context = selectCostContext(state);
  const due = selectPlannedMeals(state)
    .filter(
      (meal) =>
        meal.snapshot === null &&
        meal.date < today &&
        (onlyIds === null || onlyIds.has(meal.id)),
    )
    .map((meal) => ({
      meal,
      snapshot: buildSnapshot(meal.items, context, now),
    }));
  const chunks = Array.from(
    { length: Math.ceil(due.length / FREEZE_BATCH_SIZE) },
    (_, index) =>
      due.slice(index * FREEZE_BATCH_SIZE, (index + 1) * FREEZE_BATCH_SIZE),
  );
  const counts = await Promise.all(
    chunks.map((chunk) => freezeChunk(uid, chunk)),
  );

  return counts.reduce((sum, count) => sum + count, 0);
}

/** The step before an edit that moves a price or a recipe. A freeze that fails never stops the person's own edit; those meals just stay open until the next one. */
export const freezeBeforeEdit = (uid: string, state: RootState) =>
  freezeLoadedPastMeals(uid, state).catch(() => 0);

interface FreezePastMealsInput {
  uid: string;
  /** Freeze only these meals, so a freeze already in flight is never written twice. */
  onlyIds: Set<string> | null;
}

export const freezePastMeals = createAsyncThunk<
  number,
  FreezePastMealsInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/plannedMeals/freeze',
  async ({ uid, onlyIds }, { getState, rejectWithValue }) => {
    try {
      return await freezeLoadedPastMeals(uid, getState(), Date.now(), onlyIds);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to keep past days as they were.'),
      );
    }
  },
);
