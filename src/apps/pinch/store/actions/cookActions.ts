import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  COOK_BATCH_SIZE,
  MAX_COOKED_SERVINGS,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import type { Cook } from '@apps/pinch/types';
import {
  getCookId,
  getMissingCookFields,
  isCookHistoryFull,
  isValidCookServings,
  mergePlannedCook,
} from '@apps/pinch/utils/cooks';

const cookDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'cooks', id);

const BAD_SERVINGS = `Pick a number of servings above zero, up to ${MAX_COOKED_SERVINGS.toLocaleString('en-US')}.`;
const BAD_TIME = 'Pick a time that has already passed.';
const FULL = `A recipe's history holds up to ${SOFT_MAX_COOKS_PER_RECIPE} cooks. Delete an older one to make room.`;
const OFFLINE_MESSAGE = 'Check your connection and try again.';
const MINUTE_MS = 60_000;

const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch cook write failed', error);
    return error.code === 'unavailable' || !navigator.onLine
      ? OFFLINE_MESSAGE
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

const getAddProblem = (
  state: RootState,
  recipeId: string,
  servings: number,
  cookedAt: number,
) => {
  const { isLoaded, loadError, items } = state.pinch.cooks;
  if (loadError !== null) {
    return "Your cooking history couldn't load, so adding is paused.";
  }
  if (!isLoaded) {
    return 'Your cooking history is still loading. Try again in a moment.';
  }
  if (!state.pinch.recipes.items.some((recipe) => recipe.id === recipeId)) {
    return 'This recipe is gone, so there is nothing to add.';
  }
  if (!isValidCookServings(servings)) return BAD_SERVINGS;
  if (!Number.isFinite(cookedAt) || cookedAt > Date.now() + MINUTE_MS) {
    return BAD_TIME;
  }
  const count = items.filter((cook) => cook.recipeId === recipeId).length;
  return isCookHistoryFull(count) ? FULL : null;
};

interface AddCookInput {
  uid: string;
  recipeId: string;
  servings: number;
  cookedAt: number;
}

export const addCook = createAsyncThunk<
  string,
  AddCookInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/add',
  async (
    { uid, recipeId, servings, cookedAt },
    { getState, rejectWithValue },
  ) => {
    const problem = getAddProblem(getState(), recipeId, servings, cookedAt);
    if (problem !== null) return rejectWithValue(problem);

    const now = Date.now();
    const cook: Cook = {
      id: generateUuid(),
      recipeId,
      plannedMealId: null,
      servings,
      cookedAt,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(cookDoc(uid, cook.id), cook);
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this cook.'),
      );
    }

    return cook.id;
  },
);

interface MarkPlannedCookedInput {
  uid: string;
  plannedMealId: string;
  recipeId: string;
  servings: number;
  cookedAt: number;
}

export interface MarkPlannedCookedResult {
  id: string;
  isNew: boolean;
}

/** A transaction, so it needs a connection: two taps or two devices leave one cook. */
export const markPlannedCooked = createAsyncThunk<
  MarkPlannedCookedResult,
  MarkPlannedCookedInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/markPlanned',
  async (
    { uid, plannedMealId, recipeId, servings, cookedAt },
    { getState, rejectWithValue },
  ) => {
    const id = getCookId(plannedMealId, recipeId);
    const alreadyThere = getState().pinch.cooks.items.some(
      (cook) => cook.id === id,
    );
    const problem = alreadyThere
      ? null
      : getAddProblem(getState(), recipeId, servings, cookedAt);
    if (problem !== null) return rejectWithValue(problem);

    try {
      const isNew = await runTransaction(db, async (transaction) => {
        const ref = cookDoc(uid, id);
        const snapshot = await transaction.get(ref);
        const now = Date.now();
        const { isNew, cook } = mergePlannedCook(
          snapshot.exists() ? (snapshot.data() as Cook) : null,
          {
            id,
            recipeId,
            plannedMealId,
            servings,
            cookedAt,
            createdAt: now,
            updatedAt: now,
          },
        );
        if (isNew) transaction.set(ref, cook);
        return isNew;
      });

      return { id, isNew };
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to mark this as cooked.'),
      );
    }
  },
);

interface UpdateCookInput {
  uid: string;
  id: string;
  servings: number;
  cookedAt: number;
}

export const updateCook = createAsyncThunk<
  string,
  UpdateCookInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/update',
  async ({ uid, id, servings, cookedAt }, { getState, rejectWithValue }) => {
    const existing = getState().pinch.cooks.items.find(
      (cook) => cook.id === id,
    );
    if (!existing) {
      return rejectWithValue('This cook is gone, so there is nothing to save.');
    }
    if (!isValidCookServings(servings)) return rejectWithValue(BAD_SERVINGS);
    if (!Number.isFinite(cookedAt) || cookedAt > Date.now() + MINUTE_MS) {
      return rejectWithValue(BAD_TIME);
    }

    try {
      await updateDoc(cookDoc(uid, id), {
        ...getMissingCookFields(existing),
        servings,
        cookedAt,
        updatedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this change.'),
      );
    }

    return id;
  },
);

interface RemoveCookInput {
  uid: string;
  id: string;
}

export const removeCook = createAsyncThunk<
  string,
  RemoveCookInput,
  { rejectValue: string }
>('pinch/cooks/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(cookDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete this cook.'),
    );
  }

  return id;
});

/** A failure is the caller's to ignore: a cook whose recipe is gone is never read. */
export async function deleteCooks(uid: string, cooks: Cook[]) {
  const groups = Array.from(
    { length: Math.ceil(cooks.length / COOK_BATCH_SIZE) },
    (_, index) =>
      cooks.slice(index * COOK_BATCH_SIZE, (index + 1) * COOK_BATCH_SIZE),
  );

  await Promise.all(
    groups.map((group) => {
      const batch = writeBatch(db);
      group.forEach((cook) => batch.delete(cookDoc(uid, cook.id)));
      return batch.commit();
    }),
  );
}
