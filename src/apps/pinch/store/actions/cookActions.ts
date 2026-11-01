import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import {
  getErrorMessage,
  getStorageErrorMessage,
} from '@/utils/errorUtils';
import { compressImageForUse } from '@/utils/imageCompression';
import {
  COOK_BATCH_SIZE,
  MAX_COOKED_SERVINGS,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import type { Cook } from '@apps/pinch/types';
import {
  getCookId,
  getCookPhotoPath,
  getMissingCookFields,
  isCookHistoryFull,
  isValidCookRating,
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
      rating: null,
      photoPath: null,
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
            rating: null,
            photoPath: null,
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

interface MarkPlannedPlateInput {
  uid: string;
  plannedMealId: string;
  entries: { recipeId: string; servings: number }[];
  cookedAt: number;
}

export interface MarkPlannedPlateResult extends MarkPlannedCookedResult {
  recipeId: string;
}

/** One transaction for a plate's recipes, so their cooks land together or not at all; a recipe already marked for the meal keeps its cook. */
export const markPlannedPlateCooked = createAsyncThunk<
  MarkPlannedPlateResult[],
  MarkPlannedPlateInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/markPlannedPlate',
  async (
    { uid, plannedMealId, entries, cookedAt },
    { getState, rejectWithValue },
  ) => {
    const state = getState();
    const known = new Set(state.pinch.cooks.items.map((cook) => cook.id));
    const problem =
      entries
        .map(({ recipeId, servings }) =>
          known.has(getCookId(plannedMealId, recipeId))
            ? null
            : getAddProblem(state, recipeId, servings, cookedAt),
        )
        .find((entryProblem) => entryProblem !== null) ?? null;
    if (problem !== null) return rejectWithValue(problem);

    try {
      const results = await runTransaction(db, async (transaction) => {
        const targets = entries.map((entry) => {
          const id = getCookId(plannedMealId, entry.recipeId);
          return { entry, id, ref: cookDoc(uid, id) };
        });
        const snapshots = await Promise.all(
          targets.map((target) => transaction.get(target.ref)),
        );
        const now = Date.now();
        return targets.map(({ entry, id, ref }, index) => {
          const snapshot = snapshots[index];
          const { isNew, cook } = mergePlannedCook(
            snapshot.exists() ? (snapshot.data() as Cook) : null,
            {
              id,
              recipeId: entry.recipeId,
              plannedMealId,
              servings: entry.servings,
              cookedAt,
              rating: null,
              photoPath: null,
              createdAt: now,
              updatedAt: now,
            },
          );
          if (isNew) transaction.set(ref, cook);
          return { recipeId: entry.recipeId, id, isNew };
        });
      });

      return results;
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

/** Deletes a cook's photo files once its documents are gone; a file that can't be deleted is left, since nothing points to it any more. */
const deletePhotos = (paths: (string | null | undefined)[]) =>
  Promise.all(
    paths.flatMap((path) =>
      path
        ? [
            deleteFile(path).catch((error) =>
              console.error("Pinch could not delete a cook's photo", error),
            ),
          ]
        : [],
    ),
  );

export const removeCook = createAsyncThunk<
  string,
  RemoveCookInput,
  { state: RootState; rejectValue: string }
>('pinch/cooks/remove', async ({ uid, id }, { getState, rejectWithValue }) => {
  const photoPath = getState().pinch.cooks.items.find(
    (cook) => cook.id === id,
  )?.photoPath;
  try {
    await deleteDoc(cookDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete this cook.'),
    );
  }
  await deletePhotos([photoPath]);

  return id;
});

interface RemoveCooksInput {
  uid: string;
  ids: string[];
}

/** One batch, so taking back several cooks removes all of them or none. */
export const removeCooks = createAsyncThunk<
  string[],
  RemoveCooksInput,
  { state: RootState; rejectValue: string }
>('pinch/cooks/removeMany', async ({ uid, ids }, { getState, rejectWithValue }) => {
  const photoPaths = getState()
    .pinch.cooks.items.filter((cook) => ids.includes(cook.id))
    .map((cook) => cook.photoPath);
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(cookDoc(uid, id)));
    await batch.commit();
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete these cooks.'),
    );
  }
  await deletePhotos(photoPaths);

  return ids;
});

interface SetCookReviewInput {
  uid: string;
  id: string;
  /** A new rating, or null to take it off; leave out to keep it. */
  rating?: number | null;
  /** A new photo, or null to take it off; leave out to keep it. */
  photoFile?: File | null;
}

/** How a cook turned out: its rating and its one photo, each written on its own as a field-scoped `updateDoc` that touches nothing else on the cook. A photo goes to Storage first under a new name and is cleaned up if the write fails; the one it replaces is deleted once the write has committed. */
export const setCookReview = createAsyncThunk<
  string,
  SetCookReviewInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/setReview',
  async ({ uid, id, rating, photoFile }, { getState, rejectWithValue }) => {
    const existing = getState().pinch.cooks.items.find(
      (cook) => cook.id === id,
    );
    if (!existing) {
      return rejectWithValue('This cook is gone, so there is nothing to save.');
    }
    if (rating != null && !isValidCookRating(rating)) {
      return rejectWithValue('Pick between half a star and five stars.');
    }

    const now = Date.now();
    const newPath =
      photoFile instanceof File ? getCookPhotoPath(uid, id, now) : null;
    try {
      if (newPath !== null && photoFile) {
        const resized = await compressImageForUse(photoFile, 'photo');
        if (resized === null) {
          return rejectWithValue(
            "That picture couldn't be read. Try a JPG, PNG or WebP photo.",
          );
        }
        await uploadFile(newPath, resized);
      }
      await updateDoc(cookDoc(uid, id), {
        ...getMissingCookFields(existing),
        ...(rating === undefined ? {} : { rating }),
        ...(photoFile === undefined
          ? {}
          : { photoPath: newPath }),
        updatedAt: now,
      });
    } catch (error) {
      if (newPath !== null) await deleteFile(newPath).catch(() => undefined);
      return rejectWithValue(
        error instanceof FirebaseError && error.code.startsWith('storage/')
          ? getStorageErrorMessage(error, "We couldn't save that picture.")
          : getWriteMessage(error, "Unable to save how it turned out."),
      );
    }

    if (photoFile !== undefined && existing.photoPath) {
      await deletePhotos([existing.photoPath]);
    }

    return id;
  },
);

/** Reads the recipe's cooks from Firestore, since the store is empty while they load or after they fail to. A failure is the caller's to ignore: a cook whose recipe is gone is never read. */
export async function deleteCooks(uid: string, recipeId: string) {
  const { docs } = await getDocs(
    query(
      collection(db, 'apps', 'pinch', 'kitchens', uid, 'cooks'),
      where('recipeId', '==', recipeId),
    ),
  );
  const groups = Array.from(
    { length: Math.ceil(docs.length / COOK_BATCH_SIZE) },
    (_, index) =>
      docs.slice(index * COOK_BATCH_SIZE, (index + 1) * COOK_BATCH_SIZE),
  );

  await Promise.all(
    groups.map((group) => {
      const batch = writeBatch(db);
      group.forEach((cook) => batch.delete(cook.ref));
      return batch.commit();
    }),
  );
  await deletePhotos(
    docs.map((cook) => (cook.data() as Partial<Cook>).photoPath),
  );
}
