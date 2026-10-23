import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  doc,
  getDocsFromServer,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@/lib/firebase/config';
import { deleteFile } from '@/lib/firebase/storage';
import type {
  CopyPinchShareCoverRequest,
  CopyPinchShareCoverResult,
  IngredientRecord,
  Meal,
  PlannedMeal,
  Recipe,
  RecipeNote,
  SharedMeal,
  SharedRecipe,
} from '@apps/pinch/types';
import { getChunks } from '@apps/pinch/utils/collections';
import {
  getCoverTargets,
  getWritten,
  planMealImport,
  planRecipeImport,
  planUndo,
  type ShareImportPlan,
  type ShareImportPlanResult,
  type ShareImportWritten,
  type UndoSurvey,
} from '@apps/pinch/utils/importShare';
import { getRecipeCoverPath } from '@apps/pinch/utils/recipeCover';

const OFFLINE_MESSAGE = 'Adding needs a connection. Check yours and try again.';
const ADD_FAILED_MESSAGE = "Couldn't add it just now. Please try again.";
const UNDO_FAILED_MESSAGE = "Couldn't undo that just now. Please try again.";
const QUERY_VALUE_LIMIT = 30;

class ShareImportProblem extends Error {}

const kitchenCollection = (uid: string, name: string) =>
  collection(db, 'apps', 'pinch', 'kitchens', uid, name);

const kitchenDoc = (uid: string, name: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, name, id);

const copyCoverCallable = httpsCallable<
  CopyPinchShareCoverRequest,
  CopyPinchShareCoverResult
>(functions, 'copyPinchShareCover');

const getFailureMessage = (error: unknown, fallback: string) => {
  if (error instanceof ShareImportProblem) return error.message;
  if (
    !navigator.onLine ||
    (error instanceof FirebaseError && error.code === 'unavailable')
  ) {
    return OFFLINE_MESSAGE;
  }

  console.error(
    'Pinch share import failed',
    error instanceof FirebaseError ? error.code : error,
  );
  return fallback;
};

/** From the server, not the cache: a partial cache would make an ingredient the person has look new. */
const readOwnIngredients = async (uid: string) => {
  const snapshot = await getDocsFromServer(
    kitchenCollection(uid, 'ingredients'),
  );
  return snapshot.docs.map((entry) => entry.data() as IngredientRecord);
};

const commitPlan = async (uid: string, plan: ShareImportPlan) => {
  const batch = writeBatch(db);
  plan.ingredients.forEach((record) =>
    batch.set(kitchenDoc(uid, 'ingredients', record.id), record),
  );
  plan.recipes.forEach(({ recipe, tips }) => {
    batch.set(kitchenDoc(uid, 'recipes', recipe.id), recipe);
    tips.forEach((tip) => batch.set(kitchenDoc(uid, 'notes', tip.id), tip));
  });
  if (plan.meal) {
    batch.set(kitchenDoc(uid, 'meals', plan.meal.id), plan.meal);
  }
  await batch.commit();
};

/** Best effort, after the commit: a cover that can't be copied leaves its recipe without a picture and never fails the add. */
const copyCovers = async (
  uid: string,
  shareId: string,
  plan: ShareImportPlan,
) => {
  const copied = await Promise.all(
    getCoverTargets(plan).map(async ({ index, recipeId }) => {
      const path = getRecipeCoverPath(uid, recipeId);
      try {
        const { data } = await copyCoverCallable({ shareId, index, recipeId });
        if (data.coverPath !== path) return null;

        const updatedAt = Date.now();
        await updateDoc(kitchenDoc(uid, 'recipes', recipeId), {
          coverPath: path,
          updatedAt,
        });
        return { recipeId, updatedAt };
      } catch (error) {
        console.error(
          'Pinch could not copy a shared cover',
          error instanceof FirebaseError ? error.code : 'unknown',
        );
        await deleteFile(path).catch(() => undefined);
        return null;
      }
    }),
  );

  return copied.filter((entry) => entry !== null);
};

const runImport = async (
  uid: string,
  shareId: string,
  makePlan: (records: IngredientRecord[], now: number) => ShareImportPlanResult,
) => {
  if (!navigator.onLine) throw new ShareImportProblem(OFFLINE_MESSAGE);

  const { plan, problem } = makePlan(await readOwnIngredients(uid), Date.now());
  if (plan === null)
    throw new ShareImportProblem(problem ?? ADD_FAILED_MESSAGE);

  await commitPlan(uid, plan);
  const written = getWritten(plan, await copyCovers(uid, shareId, plan));
  return written;
};

interface AddSharedRecipeInput {
  uid: string;
  shareId: string;
  recipe: SharedRecipe;
}

/** Adds a shared recipe in one batch with the ingredients it needs, then copies its cover. Returns what it wrote, for the Undo. */
export const addSharedRecipe = createAsyncThunk<
  ShareImportWritten,
  AddSharedRecipeInput,
  { rejectValue: string }
>(
  'pinch/importShare/addRecipe',
  async ({ uid, shareId, recipe }, { rejectWithValue }) => {
    try {
      return await runImport(uid, shareId, (records, now) =>
        planRecipeImport(recipe, records, now),
      );
    } catch (error) {
      return rejectWithValue(getFailureMessage(error, ADD_FAILED_MESSAGE));
    }
  },
);

interface AddSharedMealInput {
  uid: string;
  shareId: string;
  meal: SharedMeal;
}

/** Adds a shared saved meal, its recipes and the ingredients they need in one batch, then the covers. */
export const addSharedMeal = createAsyncThunk<
  ShareImportWritten,
  AddSharedMealInput,
  { rejectValue: string }
>(
  'pinch/importShare/addMeal',
  async ({ uid, shareId, meal }, { rejectWithValue }) => {
    try {
      return await runImport(uid, shareId, (records, now) =>
        planMealImport(meal, records, now),
      );
    } catch (error) {
      return rejectWithValue(getFailureMessage(error, ADD_FAILED_MESSAGE));
    }
  },
);

/** From the server too, so a cache that is behind never says nothing uses an ingredient. */
const readUndoSurvey = async (
  uid: string,
  written: ShareImportWritten,
): Promise<UndoSurvey> => {
  const recipeIds = written.recipes.map((entry) => entry.id);
  const ingredientIds = written.ingredients.map((entry) => entry.id);
  const watched = new Set([...recipeIds, ...ingredientIds]);
  const [recipes, meals, ingredients, notes, planned, products, containers] =
    await Promise.all([
      getDocsFromServer(kitchenCollection(uid, 'recipes')),
      getDocsFromServer(kitchenCollection(uid, 'meals')),
      getDocsFromServer(kitchenCollection(uid, 'ingredients')),
      getDocsFromServer(kitchenCollection(uid, 'notes')),
      Promise.all(
        getChunks([...watched], QUERY_VALUE_LIMIT).map((part) =>
          getDocsFromServer(
            query(
              kitchenCollection(uid, 'plannedMeals'),
              where('refIds', 'array-contains-any', part),
            ),
          ),
        ),
      ),
      Promise.all(
        getChunks(ingredientIds, QUERY_VALUE_LIMIT).map((part) =>
          getDocsFromServer(
            query(
              kitchenCollection(uid, 'products'),
              where('ingredientId', 'in', part),
            ),
          ),
        ),
      ),
      Promise.all(
        getChunks(recipeIds, QUERY_VALUE_LIMIT).map((part) =>
          getDocsFromServer(
            query(
              kitchenCollection(uid, 'containers'),
              where('recipeId', 'in', part),
            ),
          ),
        ),
      ),
    ]);

  const survey: UndoSurvey = {
    recipes: new Map(
      recipes.docs.map((entry) => {
        const data = entry.data() as Recipe;
        return [
          entry.id,
          {
            updatedAt: data.updatedAt,
            ingredientIds: (data.ingredients ?? []).map(
              (line) => line.ingredientId,
            ),
          },
        ];
      }),
    ),
    meals: new Map(
      meals.docs.map((entry) => {
        const data = entry.data() as Meal;
        return [
          entry.id,
          { updatedAt: data.updatedAt, items: data.items ?? [] },
        ];
      }),
    ),
    ingredients: new Map(
      ingredients.docs.map((entry) => [
        entry.id,
        (entry.data() as IngredientRecord).updatedAt,
      ]),
    ),
    notes: new Map(
      notes.docs.map((entry) => {
        const data = entry.data() as RecipeNote;
        return [entry.id, { updatedAt: data.updatedAt, recipeId: data.recipeId }];
      }),
    ),
    usedIds: new Set([
      ...planned
        .flatMap((snapshot) => snapshot.docs)
        .flatMap((entry) => (entry.data() as PlannedMeal).refIds ?? [])
        .filter((id) => watched.has(id)),
      ...products
        .flatMap((snapshot) => snapshot.docs)
        .map((entry) => entry.data().ingredientId as string),
      ...containers
        .flatMap((snapshot) => snapshot.docs)
        .map((entry) => entry.data().recipeId as string),
    ]),
  };

  return survey;
};

interface UndoSharedImportInput {
  uid: string;
  written: ShareImportWritten;
}

/** Takes back exactly what an add wrote, all or none, and nothing the person has changed or used since. */
export const undoSharedImport = createAsyncThunk<
  { keptIngredients: number },
  UndoSharedImportInput,
  { rejectValue: string }
>('pinch/importShare/undo', async ({ uid, written }, { rejectWithValue }) => {
  try {
    if (!navigator.onLine) throw new ShareImportProblem(OFFLINE_MESSAGE);

    const undo = planUndo(written, await readUndoSurvey(uid, written));
    if (undo.problem !== null) throw new ShareImportProblem(undo.problem);

    const batch = writeBatch(db);
    undo.recipeIds.forEach((id) =>
      batch.delete(kitchenDoc(uid, 'recipes', id)),
    );
    if (undo.mealId !== null) {
      batch.delete(kitchenDoc(uid, 'meals', undo.mealId));
    }
    undo.tipIds.forEach((id) => batch.delete(kitchenDoc(uid, 'notes', id)));
    undo.ingredientIds.forEach((id) =>
      batch.delete(kitchenDoc(uid, 'ingredients', id)),
    );
    await batch.commit();

    await Promise.all(
      written.coverRecipeIds
        .filter((id) => undo.recipeIds.includes(id))
        .map((id) =>
          deleteFile(getRecipeCoverPath(uid, id)).catch(() => undefined),
        ),
    );
    return { keptIngredients: undo.keptIngredients };
  } catch (error) {
    return rejectWithValue(getFailureMessage(error, UNDO_FAILED_MESSAGE));
  }
});
