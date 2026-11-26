import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { runHeldTransaction } from '@apps/pinch/store/actions/heldTransaction';
import {
  COOK_BATCH_SIZE,
  MAX_COOK_DURATION_HOURS,
  MAX_COOK_PHOTOS,
  MAX_COOKED_SERVINGS,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import type { Cook, CookStepTimes } from '@apps/pinch/types';
import {
  getCookId,
  getCookPhotoPath,
  getCookPhotoPaths,
  getMissingCookFields,
  isCookHistoryFull,
  isValidCookDuration,
  isValidCookRating,
  isValidCookServings,
  mergePlannedCook,
} from '@apps/pinch/utils/cooks';

const cookDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'cooks', id);

const BAD_SERVINGS = `Pick a number of servings above zero, up to ${MAX_COOKED_SERVINGS.toLocaleString('en-US')}.`;
const BAD_TIME = 'Pick a time that has already passed.';
const BAD_DURATION = `Pick how long it took, up to ${MAX_COOK_DURATION_HOURS} hours.`;
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
  durationSeconds: number | null;
}

export const addCook = createAsyncThunk<
  string,
  AddCookInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/add',
  async (
    { uid, recipeId, servings, cookedAt, durationSeconds },
    { getState, rejectWithValue },
  ) => {
    const problem = getAddProblem(getState(), recipeId, servings, cookedAt);
    if (problem !== null) return rejectWithValue(problem);
    if (!isValidCookDuration(durationSeconds)) {
      return rejectWithValue(BAD_DURATION);
    }

    const now = Date.now();
    const cook: Cook = {
      id: generateUuid(),
      recipeId,
      plannedMealId: null,
      servings,
      cookedAt,
      rating: null,
      photoPath: null,
      photoPaths: [],
      durationSeconds,
      stepTimes: null,
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
      const isNew = await runHeldTransaction(uid, async (transaction) => {
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
            photoPaths: [],
            durationSeconds: null,
            stepTimes: null,
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
      const results = await runHeldTransaction(uid, async (transaction) => {
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
              photoPaths: [],
              durationSeconds: null,
              stepTimes: null,
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
  /** Left out to keep what the cook already says. */
  durationSeconds?: number | null;
}

export const updateCook = createAsyncThunk<
  string,
  UpdateCookInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/update',
  async (
    { uid, id, servings, cookedAt, durationSeconds },
    { getState, rejectWithValue },
  ) => {
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
    if (
      durationSeconds !== undefined &&
      !isValidCookDuration(durationSeconds)
    ) {
      return rejectWithValue(BAD_DURATION);
    }

    try {
      await updateDoc(cookDoc(uid, id), {
        ...getMissingCookFields(existing),
        servings,
        cookedAt,
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
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
  const existing = getState().pinch.cooks.items.find((cook) => cook.id === id);
  const photoPaths = existing ? getCookPhotoPaths(existing) : [];
  try {
    await deleteDoc(cookDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete this cook.'),
    );
  }
  await deletePhotos(photoPaths);

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
>(
  'pinch/cooks/removeMany',
  async ({ uid, ids }, { getState, rejectWithValue }) => {
    const photoPaths = getState()
      .pinch.cooks.items.filter((cook) => ids.includes(cook.id))
      .flatMap((cook) => getCookPhotoPaths(cook));
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
  },
);

interface SetCookReviewInput {
  uid: string;
  id: string;
  /** A new rating, or null to take it off. */
  rating: number | null;
}

/** How a cook turned out, as a field-scoped `updateDoc` that touches nothing else on the cook. */
export const setCookReview = createAsyncThunk<
  string,
  SetCookReviewInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/setReview',
  async ({ uid, id, rating }, { getState, rejectWithValue }) => {
    const existing = getState().pinch.cooks.items.find(
      (cook) => cook.id === id,
    );
    if (!existing) {
      return rejectWithValue('This cook is gone, so there is nothing to save.');
    }
    if (rating != null && !isValidCookRating(rating)) {
      return rejectWithValue('Pick between half a star and five stars.');
    }

    try {
      await updateDoc(cookDoc(uid, id), {
        ...getMissingCookFields(existing),
        rating,
        updatedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save how it turned out.'),
      );
    }

    return id;
  },
);

interface SetCookTimingInput {
  uid: string;
  timings: {
    id: string;
    durationSeconds: number | null;
    stepTimes: CookStepTimes;
  }[];
}

/** What cooking mode timed, written onto the cooks its Finish recorded in one batch of field-scoped updates. */
export const setCookTiming = createAsyncThunk<
  string[],
  SetCookTimingInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/cooks/setTiming',
  async ({ uid, timings }, { getState, rejectWithValue }) => {
    const items = getState().pinch.cooks.items;
    const now = Date.now();
    try {
      const batch = writeBatch(db);
      timings.forEach(({ id, durationSeconds, stepTimes }) => {
        const existing = items.find((cook) => cook.id === id);
        batch.update(cookDoc(uid, id), {
          ...(existing ? getMissingCookFields(existing) : {}),
          durationSeconds: isValidCookDuration(durationSeconds)
            ? durationSeconds
            : null,
          stepTimes,
          updatedAt: now,
        });
      });
      await batch.commit();
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save how long it took.'),
      );
    }
    return timings.map(({ id }) => id);
  },
);

const GONE_COOK = 'This cook is gone, so there is nothing to save.';

/** Rewrites a cook's photo list inside a transaction, so photos added one after another never overwrite each other before the listener catches up. An older cook's single photo joins the list, and the deprecated field is cleared. */
const writeCookPhotos = (
  uid: string,
  id: string,
  change: (paths: string[]) => string[],
) =>
  runHeldTransaction(uid, async (transaction) => {
    const ref = cookDoc(uid, id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(GONE_COOK);
    const existing = snapshot.data() as Partial<Cook>;
    transaction.update(ref, {
      ...getMissingCookFields(existing),
      photoPath: null,
      photoPaths: change(getCookPhotoPaths(existing)),
      updatedAt: Date.now(),
    });
  });

/** Saves one more photo of a cook (already shrunk on the device) and returns its path; at the cap, or when the write fails, the uploaded file is cleaned up and a readable message thrown. */
export async function addCookPhoto(uid: string, id: string, file: File) {
  const path = getCookPhotoPath(uid, id, Date.now());
  try {
    await uploadFile(path, file);
    await writeCookPhotos(uid, id, (paths) => {
      if (paths.length >= MAX_COOK_PHOTOS) {
        throw new Error(`A cook holds up to ${MAX_COOK_PHOTOS} photos.`);
      }
      return [...paths, path];
    });
  } catch (error) {
    await deleteFile(path).catch(() => undefined);
    throw new Error(
      error instanceof FirebaseError && error.code.startsWith('storage/')
        ? getStorageErrorMessage(error, "We couldn't save that picture.")
        : getWriteMessage(error, "We couldn't save that picture."),
      { cause: error },
    );
  }
  return path;
}

/** Takes one photo off a cook, then deletes the file once the write has committed. */
export async function removeCookPhoto(uid: string, id: string, path: string) {
  await writeCookPhotos(uid, id, (paths) =>
    paths.filter((known) => known !== path),
  );
  await deletePhotos([path]);
}

/** Saves a new order for a cook's photos; the first is its cover. A path the cook no longer holds is dropped, and one missing from the order keeps its place at the end. */
export async function reorderCookPhotos(
  uid: string,
  id: string,
  order: string[],
) {
  await writeCookPhotos(uid, id, (paths) => [
    ...order.filter((path) => paths.includes(path)),
    ...paths.filter((path) => !order.includes(path)),
  ]);
}

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
    docs.flatMap((cook) => getCookPhotoPaths(cook.data() as Partial<Cook>)),
  );
}
