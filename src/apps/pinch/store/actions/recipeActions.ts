import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { freezeLoadedPastMeals } from '@apps/pinch/store/actions/freezeActions';
import { readUsage } from '@apps/pinch/store/actions/usageActions';
import { isInUse } from '@apps/pinch/utils/references';
import { resizeImageToWebp } from '@/utils/imageCompression';
import { RECIPE_COVER_MAX_DIMENSION } from '@apps/pinch/constants';
import type {
  IngredientRecord,
  NutritionValues,
  Recipe,
  RecipeIngredient,
  RecipeSource,
} from '@apps/pinch/types';

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

export const getRecipeCoverPath = (uid: string, recipeId: string) =>
  `apps/pinch/kitchens/${uid}/recipes/${recipeId}/cover.webp`;

export interface RecipeDraft {
  /** The recipe being edited; null adds a new one. */
  id: string | null;
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Per serving, typed over the added-up value; null keeps every metric derived. */
  nutritionOverride: NutritionValues | null;
  /** How a new recipe came to be; an edit keeps the recipe's own. */
  source: RecipeSource;
  /** Custom ingredients the reader proposed and the person kept: created with the recipe, in one batch. */
  newIngredients: { id: string; name: string }[];
  /** A new cover to upload, if one was picked. */
  coverFile: File | null;
  removeCover: boolean;
}

interface SaveRecipeInput {
  uid: string;
  draft: RecipeDraft;
}

/** Writes a recipe: a new one in full, an edit as only the fields the form owns (backfilling keys an older recipe lacks). The cover goes to Storage first and is cleaned up if the write fails. */
export const saveRecipe = createAsyncThunk<
  string,
  SaveRecipeInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/recipes/save',
  async ({ uid, draft }, { getState, rejectWithValue }) => {
    const now = Date.now();
    const recipeId = draft.id ?? generateUuid();
    const existing = draft.id
      ? (getState().pinch.recipes.items.find(
          (recipe) => recipe.id === draft.id,
        ) ?? null)
      : null;
    if (draft.id && !existing) {
      return rejectWithValue(
        'This recipe is gone, so there is nothing to save.',
      );
    }
    const path = getRecipeCoverPath(uid, recipeId);

    try {
      await freezeLoadedPastMeals(uid, getState());
      if (draft.coverFile) {
        await uploadFile(
          path,
          await resizeImageToWebp(draft.coverFile, RECIPE_COVER_MAX_DIMENSION),
        );
      }

      const coverPath = draft.coverFile
        ? path
        : draft.removeCover
          ? null
          : (existing?.coverPath ?? null);
      const fields = {
        title: draft.title.trim(),
        description: draft.description,
        servings: draft.servings,
        prepMinutes: draft.prepMinutes,
        cookMinutes: draft.cookMinutes,
        coverPath,
        ingredients: draft.ingredients,
        steps: draft.steps,
        nutritionOverride: draft.nutritionOverride,
        updatedAt: now,
      };

      const batch = writeBatch(db);
      draft.newIngredients.forEach((ingredient) => {
        const record: IngredientRecord = {
          id: ingredient.id,
          catalogId: null,
          name: ingredient.name.trim(),
          familyId: null,
          iconKey: null,
          nutritionPer100g: null,
          servingAmount: null,
          servingUnit: null,
          gramsPerMl: null,
          gramsEach: null,
          defaultProductId: null,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(
          doc(
            db,
            'apps',
            'pinch',
            'kitchens',
            uid,
            'ingredients',
            ingredient.id,
          ),
          record,
        );
      });
      if (existing) {
        batch.update(recipeDoc(uid, recipeId), {
          ...fields,
          ...('isArchived' in existing ? {} : { isArchived: false }),
        });
      } else {
        const recipe: Recipe = {
          id: recipeId,
          ...fields,
          source: draft.source,
          isArchived: false,
          createdAt: now,
        };
        batch.set(recipeDoc(uid, recipeId), recipe);
      }
      await batch.commit();
    } catch (error) {
      if (draft.coverFile && existing?.coverPath !== path) {
        await deleteFile(path).catch(() => undefined);
      }
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this recipe.'),
      );
    }

    if (draft.removeCover && !draft.coverFile && existing?.coverPath) {
      await deleteFile(existing.coverPath).catch(() => undefined);
    }

    return recipeId;
  },
);

interface RemoveRecipeInput {
  uid: string;
  id: string;
}

/** Deletes the recipe and its cover, or archives it (cover kept) when a planned day or saved meal still uses it. */
export const removeRecipe = createAsyncThunk<
  string,
  RemoveRecipeInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/recipes/remove',
  async ({ uid, id }, { getState, rejectWithValue }) => {
    const existing = getState().pinch.recipes.items.find(
      (recipe) => recipe.id === id,
    );

    try {
      await freezeLoadedPastMeals(uid, getState());
      if (isInUse(await readUsage(uid, getState(), 'RECIPE', id))) {
        await updateDoc(recipeDoc(uid, id), {
          isArchived: true,
          updatedAt: Date.now(),
        });
        return id;
      }

      await deleteDoc(recipeDoc(uid, id));
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to delete this recipe.'),
      );
    }

    if (existing?.coverPath) {
      await deleteFile(existing.coverPath).catch(() => undefined);
    }

    return id;
  },
);
