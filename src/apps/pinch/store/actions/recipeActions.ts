import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { deleteCooks } from '@apps/pinch/store/actions/cookActions';
import { freezeBeforeEdit } from '@apps/pinch/store/actions/freezeActions';
import { deleteNotes } from '@apps/pinch/store/actions/noteActions';
import { stopSharingDeleted } from '@apps/pinch/store/actions/shareActions';
import { readUsage } from '@apps/pinch/store/actions/usageActions';
import {
  selectIngredientsById,
  selectSourcesById,
  selectTweakTracking,
} from '@apps/pinch/store/selectors';
import type { CollectionChange } from '@apps/pinch/utils/collections';
import {
  getDraftChanges,
  getRecipeSnapshot,
} from '@apps/pinch/utils/recipeChanges';
import { getTweakReason, planTweakUndo } from '@apps/pinch/utils/notes';
import { getMissingIdeaFields } from '@apps/pinch/utils/ideas';
import {
  getCoverFields,
  getRecipeCoverPath,
  isCoverUrl,
} from '@apps/pinch/utils/recipeCover';
import { isInUse } from '@apps/pinch/utils/references';
import { resizeImageToWebp } from '@/utils/imageCompression';
import { RECIPE_COVER_MAX_DIMENSION } from '@apps/pinch/constants';
import type {
  Collection,
  DishCategory,
  IngredientRecord,
  NutritionValues,
  Recipe,
  RecipeCare,
  RecipeIngredient,
  RecipeLink,
  RecipeNote,
  RecipeSource,
  Source,
} from '@apps/pinch/types';

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

const sourceDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'sources', id);

const collectionDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'collections', id);

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

/** A recipe saved by a form that couldn't offer collections, or whose row was left alone, leaves the stored list as it is, but an older recipe still gains the key. Only a change is written, as `arrayRemove` and `arrayUnion` (two writes of one batch when a save does both), so a collection another device changed in between stays. */
const getCollectionWrites = (
  existing: Recipe,
  change: CollectionChange | null,
) => {
  const { add, remove } = change ?? { add: [], remove: [] };
  if (!('collectionIds' in existing)) {
    return {
      fields: { collectionIds: add.length > 0 ? arrayUnion(...add) : [] },
      after: null,
    };
  }
  if (remove.length > 0) {
    return {
      fields: { collectionIds: arrayRemove(...remove) },
      after: add.length > 0 ? { collectionIds: arrayUnion(...add) } : null,
    };
  }
  return {
    fields: add.length > 0 ? { collectionIds: arrayUnion(...add) } : {},
    after: null,
  };
};

export interface RecipeDraft {
  /** The recipe being edited; null adds a new one. */
  id: string | null;
  title: string;
  categories: DishCategory[];
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** How to keep the leftovers, or null; written on every save, so older recipes gain the key. */
  care: RecipeCare | null;
  /** The how-to video and other links; written on every save, so older recipes gain the key. */
  links: RecipeLink[];
  /** Per serving, typed over the added-up value; null keeps every metric derived. */
  nutritionOverride: NutritionValues | null;
  /** How a new recipe came to be; an edit keeps the recipe's own. */
  source: RecipeSource;
  /** The `Source` it came from, or null; written on every save, so older recipes gain the key. */
  sourceId: string | null;
  /** What the form added to and took out of the collections it opened with; null when it couldn't offer them (they hadn't loaded), which leaves the stored list as it is. */
  collectionChange: CollectionChange | null;
  /** Collections typed with the recipe, created in the same batch so a failed save leaves no orphan and an offline one is queued whole. */
  newCollections: { id: string; label: string }[];
  /** Custom ingredients the reader proposed and the person kept: created with the recipe, in one batch. */
  newIngredients: { id: string; name: string }[];
  /** A source typed with the recipe, created in the same batch so a failed save leaves no orphan and an offline one is queued whole. */
  newSource: { id: string; label: string } | null;
  /** A new cover to upload, if one was picked. */
  coverFile: File | null;
  /** The web photo picked for the cover, as its https address, or null. It and `coverFile` are never both set: the draft passes the one chosen last. */
  coverUrl: string | null;
  removeCover: boolean;
  /** Set on its own after the recipe has committed, and only if the idea is still there. */
  fromIdeaId: string | null;
  /** Why the person changed the recipe, for the tweak a save of a cooked recipe records; ignored when none is recorded. */
  tweakReason: string;
  /** The planned changes this edit applies. When the edit changed the recipe, the oldest of them becomes the tweak that records it (same entry, no new one) and the rest are taken off; when it changed nothing they stay planned. */
  appliesChangeIds: string[];
}

interface SaveRecipeInput {
  uid: string;
  draft: RecipeDraft;
}

interface SaveRecipeResult {
  recipeId: string;
  linkedIdea: boolean;
}

type TweakPlan =
  | { kind: 'NONE' }
  | { kind: 'NEW'; note: RecipeNote }
  /** `note` is the planned change that becomes the tweak; `absorbedIds` are the others the same edit applied. */
  | { kind: 'APPLY'; note: RecipeNote; absorbedIds: string[] };

/** Compared with the recipe as this device last saw it, so an edit made elsewhere in between can show up in the lines. A planned change the edit applies turns into the tweak itself, so applying it leaves one entry. */
const getTweakPlan = (
  state: RootState,
  existing: Recipe | null,
  draft: RecipeDraft,
  now: number,
): TweakPlan => {
  if (existing === null) return { kind: 'NONE' };
  const planned = state.pinch.notes.items
    .filter(
      (note) =>
        draft.appliesChangeIds.includes(note.id) &&
        note.kind === 'CHANGE' &&
        note.recipeId === existing.id,
    )
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const isApplying = planned.length > 0;
  if (!isApplying && selectTweakTracking(state, existing.id) !== 'on') {
    return { kind: 'NONE' };
  }

  const { changes } = getDraftChanges(
    existing,
    draft,
    selectIngredientsById(state),
    selectSourcesById(state),
  );
  if (changes.length === 0) return { kind: 'NONE' };

  const tweak: RecipeNote = {
    id: isApplying ? planned[0].id : generateUuid(),
    recipeId: existing.id,
    kind: 'TWEAK',
    text: getTweakReason(draft.tweakReason),
    changes,
    cookId: isApplying ? (planned[0].cookId ?? null) : null,
    stepIndex: null,
    stepText: null,
    reason: null,
    previous: getRecipeSnapshot(existing),
    createdAt: now,
    updatedAt: now,
  };

  return isApplying
    ? {
        kind: 'APPLY',
        note: tweak,
        absorbedIds: planned.slice(1).map((note) => note.id),
      }
    : { kind: 'NEW', note: tweak };
};

/** Writes a recipe: a new one in full, an edit as only the fields the form owns (backfilling keys an older recipe lacks). A cooked recipe's edit also records a tweak note in the same batch, so the note exists exactly when the recipe changed; when the edit applies planned changes, the oldest of them becomes that tweak instead of a new entry being added. An uploaded cover goes to Storage first and is cleaned up if the write fails; a web cover is only its address, and the upload it replaces is deleted once the write has committed. */
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
    if (draft.coverUrl !== null && !isCoverUrl(draft.coverUrl)) {
      return rejectWithValue(
        'That photo’s web address can’t be saved. Pick another one.',
      );
    }
    const path = getRecipeCoverPath(uid, recipeId);
    const tweakPlan = getTweakPlan(getState(), existing, draft, now);
    const cover = getCoverFields({
      uploadPath: path,
      hasFile: draft.coverFile !== null,
      webUrl: draft.coverUrl,
      removeCover: draft.removeCover,
      existing,
    });

    try {
      await freezeBeforeEdit(uid, getState());
      if (draft.coverFile) {
        await uploadFile(
          path,
          await resizeImageToWebp(draft.coverFile, RECIPE_COVER_MAX_DIMENSION),
        );
      }

      const fields = {
        title: draft.title.trim(),
        categories: draft.categories,
        description: draft.description,
        servings: draft.servings,
        prepMinutes: draft.prepMinutes,
        cookMinutes: draft.cookMinutes,
        ...cover,
        ingredients: draft.ingredients,
        steps: draft.steps,
        care: draft.care,
        links: draft.links,
        nutritionOverride: draft.nutritionOverride,
        sourceId: draft.sourceId,
        updatedAt: now,
      };

      const batch = writeBatch(db);
      draft.newCollections.forEach((entry) => {
        const collection: Collection = {
          id: entry.id,
          label: entry.label,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(collectionDoc(uid, collection.id), collection);
      });
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
        const collectionWrites = getCollectionWrites(
          existing,
          draft.collectionChange,
        );
        batch.update(recipeDoc(uid, recipeId), {
          ...fields,
          ...('isArchived' in existing ? {} : { isArchived: false }),
          ...collectionWrites.fields,
        });
        if (collectionWrites.after) {
          batch.update(recipeDoc(uid, recipeId), collectionWrites.after);
        }
        if (tweakPlan.kind !== 'NONE') {
          batch.set(noteDoc(uid, tweakPlan.note.id), tweakPlan.note);
        }
        if (tweakPlan.kind === 'APPLY') {
          tweakPlan.absorbedIds.forEach((id) => batch.delete(noteDoc(uid, id)));
        }
      } else {
        const recipe: Recipe = {
          id: recipeId,
          ...fields,
          source: draft.source,
          collectionIds: draft.collectionChange?.add ?? [],
          isArchived: false,
          isFavorite: false,
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
        tweakPlan.kind === 'APPLY' &&
          error instanceof FirebaseError &&
          error.code === 'permission-denied'
          ? 'That change was already applied or taken off on another device. Close this and open the recipe again.'
          : getWriteMessage(error, 'Unable to save this recipe.'),
      );
    }

    if (existing?.coverPath && cover.coverPath !== existing.coverPath) {
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

interface UndoRecipeChangeInput {
  uid: string;
  recipeId: string;
  /** The tweaks the recipe's latest save wrote. */
  noteIds: string[];
}

/** Puts the recipe's edited fields back to how the tweak found them and takes the tweak off, in one transaction that re-reads both: it refuses when the recipe has been saved since (its `updatedAt` is no longer the tweak's date) or the tweak is gone. Only the compared fields and `updatedAt` are written, so the cover, care, links and collections stay as they are. */
export const undoRecipeChange = createAsyncThunk<
  number,
  UndoRecipeChangeInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/recipes/undoChange',
  async ({ uid, recipeId, noteIds }, { getState, rejectWithValue }) => {
    const noteDocs = noteIds.map((id) =>
      doc(db, 'apps', 'pinch', 'kitchens', uid, 'notes', id),
    );
    try {
      await freezeBeforeEdit(uid, getState());
      const refusal = await runTransaction(db, async (transaction) => {
        const recipeSnapshot = await transaction.get(recipeDoc(uid, recipeId));
        const noteSnapshots = await Promise.all(
          noteDocs.map((ref) => transaction.get(ref)),
        );
        const plan = planTweakUndo(
          recipeSnapshot.exists()
            ? { updatedAt: (recipeSnapshot.data() as Recipe).updatedAt }
            : null,
          noteSnapshots.map((snapshot) =>
            snapshot.exists() ? (snapshot.data() as RecipeNote) : null,
          ),
        );
        if (plan.kind === 'REFUSE') return plan.message;

        transaction.update(recipeDoc(uid, recipeId), {
          ...plan.fields,
          updatedAt: Date.now(),
        });
        noteDocs.forEach((ref) => transaction.delete(ref));
        return null;
      });
      if (refusal !== null) return rejectWithValue(refusal);
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to undo this change.'),
      );
    }

    return noteIds.length;
  },
);

interface SetRecipeFavoriteInput {
  uid: string;
  id: string;
  isFavorite: boolean;
}

/** Writes the value asked for, never a toggle read from a cache, and nothing else: an edit never writes `isFavorite`, and the star leaves `updatedAt` alone because it versions the cover. */
export const setRecipeFavorite = createAsyncThunk<
  void,
  SetRecipeFavoriteInput,
  { rejectValue: string }
>(
  'pinch/recipes/setFavorite',
  async ({ uid, id, isFavorite }, { rejectWithValue }) => {
    try {
      await updateDoc(recipeDoc(uid, id), { isFavorite });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to change this star.'),
      );
    }
  },
);

interface RemoveRecipeInput {
  uid: string;
  id: string;
}

/** Deletes the recipe, its cover, its cooks, its notes and its shared link, or archives it (cover, cooks, notes and link kept) when a planned day or saved meal still uses it. An archive leaves `updatedAt` alone: a shared link compares it, and nothing it shows changed. */
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
        await updateDoc(recipeDoc(uid, id), { isArchived: true });
        return id;
      }

      await deleteDoc(recipeDoc(uid, id));
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to delete this recipe.'),
      );
    }

    stopSharingDeleted(getState(), 'RECIPE', id);

    await deleteCooks(uid, id).catch((error) =>
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
