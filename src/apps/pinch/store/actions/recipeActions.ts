import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { deleteCooks } from '@apps/pinch/store/actions/cookActions';
import { freezeBeforeEdit } from '@apps/pinch/store/actions/freezeActions';
import { deleteNotes } from '@apps/pinch/store/actions/noteActions';
import { readUsage } from '@apps/pinch/store/actions/usageActions';
import {
  selectIngredientsById,
  selectSourcesById,
  selectTweakTracking,
} from '@apps/pinch/store/selectors';
import { getRecipeChanges } from '@apps/pinch/utils/recipeChanges';
import { getTweakReason } from '@apps/pinch/utils/notes';
import { getMissingIdeaFields } from '@apps/pinch/utils/ideas';
import { isInUse } from '@apps/pinch/utils/references';
import { resizeImageToWebp } from '@/utils/imageCompression';
import { RECIPE_COVER_MAX_DIMENSION } from '@apps/pinch/constants';
import type {
  IngredientRecord,
  NutritionValues,
  Recipe,
  RecipeIngredient,
  RecipeNote,
  RecipeSource,
  Source,
} from '@apps/pinch/types';

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

const sourceDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'sources', id);

const ideaDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'ideas', id);

const noteDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'notes', id);

const OFFLINE_MESSAGE = 'Check your connection and try again.';

const getWriteMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof FirebaseError)) {
    return getErrorMessage(error, fallback);
  }
  console.error('Pinch recipe write failed', error);
  if (error.code === 'unavailable' || !navigator.onLine) return OFFLINE_MESSAGE;
  return error.code.startsWith('storage/')
    ? getStorageErrorMessage(error, fallback)
    : fallback;
};

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
  /** The `Source` it came from, or null; written on every save, so older recipes gain the key. */
  sourceId: string | null;
  /** Custom ingredients the reader proposed and the person kept: created with the recipe, in one batch. */
  newIngredients: { id: string; name: string }[];
  /** A source typed with the recipe, created in the same batch so a failed save leaves no orphan and an offline one is queued whole. */
  newSource: { id: string; label: string } | null;
  /** A new cover to upload, if one was picked. */
  coverFile: File | null;
  removeCover: boolean;
  /** Set on its own after the recipe has committed, and only if the idea is still there. */
  fromIdeaId: string | null;
  /** Why the person changed the recipe, for the tweak a save of a cooked recipe records; ignored when none is recorded. */
  tweakReason: string;
}

interface SaveRecipeInput {
  uid: string;
  draft: RecipeDraft;
}

interface SaveRecipeResult {
  recipeId: string;
  linkedIdea: boolean;
}

/** Compared with the recipe as this device last saw it, so an edit made elsewhere in between can show up in the lines. */
const getTweak = (
  state: RootState,
  existing: Recipe | null,
  draft: RecipeDraft,
  now: number,
): RecipeNote | null => {
  if (existing === null || selectTweakTracking(state, existing.id) !== 'on') {
    return null;
  }

  const ingredientNames = new Map([
    ...selectIngredientsById(state),
    ...draft.newIngredients.map(
      (ingredient) =>
        [ingredient.id, { name: ingredient.name.trim() }] as const,
    ),
  ]);
  const sourceLabels = new Map([
    ...selectSourcesById(state),
    ...(draft.newSource
      ? [[draft.newSource.id, draft.newSource] as const]
      : []),
  ]);
  const changes = getRecipeChanges(
    existing,
    {
      title: draft.title,
      description: draft.description,
      servings: draft.servings,
      prepMinutes: draft.prepMinutes,
      cookMinutes: draft.cookMinutes,
      ingredients: draft.ingredients,
      steps: draft.steps,
      nutritionOverride: draft.nutritionOverride,
      sourceId: draft.sourceId,
    },
    ingredientNames,
    sourceLabels,
  );
  if (changes.length === 0) return null;

  const tweak: RecipeNote = {
    id: generateUuid(),
    recipeId: existing.id,
    kind: 'TWEAK',
    text: getTweakReason(draft.tweakReason),
    changes,
    cookId: null,
    createdAt: now,
    updatedAt: now,
  };

  return tweak;
};

/** Writes a recipe: a new one in full, an edit as only the fields the form owns (backfilling keys an older recipe lacks). A cooked recipe's edit also records a tweak note in the same batch, so the note exists exactly when the recipe changed. The cover goes to Storage first and is cleaned up if the write fails. */
export const saveRecipe = createAsyncThunk<
  SaveRecipeResult,
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
    const idea =
      existing === null && draft.fromIdeaId !== null
        ? (getState().pinch.ideas.items.find(
            (entry) => entry.id === draft.fromIdeaId,
          ) ?? null)
        : null;
    const path = getRecipeCoverPath(uid, recipeId);
    const tweak = getTweak(getState(), existing, draft, now);

    try {
      await freezeBeforeEdit(uid, getState());
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
        sourceId: draft.sourceId,
        updatedAt: now,
      };

      const batch = writeBatch(db);
      if (draft.newSource) {
        const source: Source = {
          id: draft.newSource.id,
          label: draft.newSource.label,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(sourceDoc(uid, source.id), source);
      }
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
        if (tweak) batch.set(noteDoc(uid, tweak.id), tweak);
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
        getWriteMessage(error, 'Unable to save this recipe.'),
      );
    }

    if (draft.removeCover && !draft.coverFile && existing?.coverPath) {
      await deleteFile(existing.coverPath).catch(() => undefined);
    }

    const linkedIdea =
      idea !== null &&
      (await updateDoc(ideaDoc(uid, idea.id), {
        ...getMissingIdeaFields(idea),
        recipeId,
        updatedAt: Date.now(),
      }).then(
        () => true,
        (error: unknown) => {
          console.error('Pinch could not link the idea to its recipe', error);
          return false;
        },
      ));

    return { recipeId, linkedIdea };
  },
);

interface RemoveRecipeInput {
  uid: string;
  id: string;
}

/** Deletes the recipe, its cover, its cooks and its notes, or archives it (cover, cooks and notes kept) when a planned day or saved meal still uses it. */
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
      await freezeBeforeEdit(uid, getState());
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
        getWriteMessage(error, 'Unable to delete this recipe.'),
      );
    }

    await deleteCooks(
      uid,
      getState().pinch.cooks.items.filter((cook) => cook.recipeId === id),
    ).catch((error) =>
      console.error("Pinch could not clear a deleted recipe's cooks", error),
    );

    await deleteNotes(uid, id).catch((error) =>
      console.error("Pinch could not clear a deleted recipe's notes", error),
    );

    if (existing?.coverPath) {
      await deleteFile(existing.coverPath).catch(() => undefined);
    }

    return id;
  },
);
