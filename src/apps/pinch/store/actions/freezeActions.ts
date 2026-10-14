import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { PlannedMeal } from '@apps/pinch/types';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_REPRICE_MEALS } from '@apps/pinch/constants';
import {
  selectCostContext,
  selectIsPinchLoaded,
  selectPinchLoadError,
  selectPlannedByDay,
  selectPlannedMeals,
} from '@apps/pinch/store/selectors';
import {
  getDateOfDayKey,
  getLocalTodayDate,
  getPlannedDayKey,
} from '@apps/pinch/utils/dayKeys';
import {
  buildRepricedSnapshot,
  buildSnapshot,
  wouldRepriceChange,
} from '@apps/pinch/utils/mealMath';

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

const OFFLINE_MESSAGE = 'Check your connection and try again.';

const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch re-price write failed', error);
    return error.code === 'unavailable' || !navigator.onLine
      ? OFFLINE_MESSAGE
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

interface RepriceDayInput {
  uid: string;
  dayKey: string;
}

/** Replaces the snapshots of a passed day's fixed meals with ones from today's prices in one transaction, writing nothing if any meal is gone. Needs a connection. */
export const repriceDay = createAsyncThunk<
  number,
  RepriceDayInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/plannedMeals/repriceDay',
  async ({ uid, dayKey }, { getState, rejectWithValue }) => {
    const state = getState();
    if (getDateOfDayKey(dayKey) >= getLocalTodayDate()) {
      return rejectWithValue(
        "Only a day that has passed can use today's prices.",
      );
    }
    if (!hasCompleteCostData(state)) {
      return rejectWithValue(
        'Your kitchen is still loading. Try again in a moment.',
      );
    }

    const ids = (selectPlannedByDay(state).get(dayKey) ?? [])
      .filter((meal) => meal.snapshot !== null)
      .map((meal) => meal.id);
    if (ids.length === 0) {
      return rejectWithValue('There is nothing on this day to price.');
    }
    if (ids.length > MAX_REPRICE_MEALS) {
      return rejectWithValue(
        `A day can use today's prices for up to ${MAX_REPRICE_MEALS} meals at a time.`,
      );
    }

    const context = selectCostContext(state);
    const changedMessage =
      'This day changed while you were pricing it, so nothing was changed. Close it and try again.';

    try {
      return await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          ids.map((id) => transaction.get(mealRef(uid, id))),
        );
        const meals = snapshots.map((snapshot) => {
          const meal = snapshot.exists()
            ? (snapshot.data() as PlannedMeal)
            : null;
          if (
            !meal ||
            !meal.snapshot ||
            getPlannedDayKey(meal.date) !== dayKey
          ) {
            throw new Error(changedMessage);
          }
          return { ref: snapshot.ref, meal, fixed: meal.snapshot };
        });

        if (!meals.some(({ meal }) => wouldRepriceChange(meal, context))) {
          return 0;
        }

        const now = Date.now();
        meals.forEach(({ ref, meal, fixed }) =>
          transaction.update(ref, {
            snapshot: buildRepricedSnapshot(fixed, meal.items, context, now),
            updatedAt: now,
          }),
        );

        return meals.length;
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, "Unable to use today's prices for this day."),
      );
    }
  },
);
