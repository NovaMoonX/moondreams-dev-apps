import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { formatDateShort } from '@/utils/formatUtils';
import { runHeldTransaction } from '@apps/pinch/store/actions/heldTransaction';
import { deleteCooks } from '@apps/pinch/store/actions/cookActions';
import { freezeBeforeEdit } from '@apps/pinch/store/actions/freezeActions';
import { deleteNotes } from '@apps/pinch/store/actions/noteActions';
import { stopSharingDeleted } from '@apps/pinch/store/actions/shareActions';
import { readUsage } from '@apps/pinch/store/actions/usageActions';
import {
  selectCollectionsById,
  selectIngredientsById,
  selectSourcesById,
  selectTweakTracking,
} from '@apps/pinch/store/selectors';
import type { CollectionChange } from '@apps/pinch/utils/collections';
import {
  getDraftChanges,
  getRecipeSnapshot,
  isUnrestoredLine,
} from '@apps/pinch/utils/recipeChanges';
import {
  getMissingNoteFields,
  getTweakReason,
  isDoneChange,
  isOpenChange,
  planGoBack,
  planTweakUndo,
} from '@apps/pinch/utils/notes';
import { getMissingIdeaFields } from '@apps/pinch/utils/ideas';
import {
  getCoverFields,
  getRecipeCoverPath,
  isCoverUrl,
} from '@apps/pinch/utils/recipeCover';
import { isInUse } from '@apps/pinch/utils/references';
import { toStoredStepSections } from '@apps/pinch/utils/stepSections';
import { compressImageForUse } from '@/utils/imageCompression';
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
const UNREADABLE_COVER =
  "That photo's format can't be opened here. Try a JPG or PNG.";

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
  /** Index for index with `steps`; written on every save (`[]` when no step has a section), so older recipes gain the key. */
  stepSections: (string | null)[];
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
  /** What the reader's split gave, when the person used one in this edit. */
  splitSteps: Pick<Recipe, 'steps' | 'stepSections'> | null;
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
  /** The planned changes this edit takes care of. When the edit changed the recipe, each is marked done by the tweak that records it, in the same write; when it changed nothing they stay planned. */
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
  /** `applied` are the planned changes the tweak marks done. */
  | { kind: 'APPLY'; note: RecipeNote; applied: RecipeNote[] };

/** Compared with the recipe as this device last saw it, so an edit made elsewhere in between can show up in the lines. The planned changes the edit takes care of stay as entries, marked done by the tweak, so the history keeps what was asked beside what was done. */
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
        isOpenChange(note) &&
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
    selectCollectionsById(state),
  );
  if (changes.length === 0) return { kind: 'NONE' };

  const tweak: RecipeNote = {
    id: generateUuid(),
    recipeId: existing.id,
    kind: 'TWEAK',
    text: getTweakReason(draft.tweakReason),
    changes,
    cookId: isApplying ? (planned[0].cookId ?? null) : null,
    stepIndex: null,
    stepText: null,
    reason: null,
    previous: changes.every(isUnrestoredLine)
      ? null
      : getRecipeSnapshot(existing),
    resolvedAt: null,
    resolvedBy: null,
    by: { kind: 'you', name: null },
    createdAt: now,
    updatedAt: now,
  };

  return isApplying
    ? { kind: 'APPLY', note: tweak, applied: planned }
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
        const cover = await compressImageForUse(draft.coverFile, 'cover');
        if (cover === null) {
          throw new Error(UNREADABLE_COVER);
        }
        await uploadFile(path, cover);
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
        stepSections: toStoredStepSections(draft.steps, draft.stepSections),
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
          addedBy: null,
          nutritionBy: null,
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
          tweakPlan.applied.forEach((change) =>
            batch.update(noteDoc(uid, change.id), {
              ...getMissingNoteFields(change),
              resolvedAt: now,
              resolvedBy: tweakPlan.note.id,
              updatedAt: now,
            }),
          );
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

/** Puts the recipe's edited fields back to how the tweak found them, takes the tweak off and plans again the changes it took care of, in one transaction that re-reads them all: it refuses when the recipe has been saved since (its `updatedAt` is no longer the tweak's date) or the tweak is gone. Only the snapshot's fields and `updatedAt` are written (the nine compared ones, plus categories, care and links when it has them), so the photo and the collections stay as they are. */
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
    const doneDocs = getState()
      .pinch.notes.items.filter(
        (note) =>
          isDoneChange(note) && noteIds.includes(note.resolvedBy ?? ''),
      )
      .map((note) => noteDoc(uid, note.id));
    try {
      await freezeBeforeEdit(uid, getState());
      const refusal = await runHeldTransaction(uid, async (transaction) => {
        const recipeSnapshot = await transaction.get(recipeDoc(uid, recipeId));
        const noteSnapshots = await Promise.all(
          noteDocs.map((ref) => transaction.get(ref)),
        );
        const doneSnapshots = await Promise.all(
          doneDocs.map((ref) => transaction.get(ref)),
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
        doneSnapshots
          .filter(
            (snapshot) =>
              snapshot.exists() &&
              noteIds.includes(
                (snapshot.data() as RecipeNote).resolvedBy ?? '',
              ),
          )
          .forEach((snapshot) =>
            transaction.update(snapshot.ref, {
              resolvedAt: null,
              resolvedBy: null,
              updatedAt: Date.now(),
            }),
          );
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

interface GoBackToChangeInput {
  uid: string;
  recipeId: string;
  noteId: string;
  /** The recipe's `updatedAt` as the screen showed it. */
  seenUpdatedAt: number;
}

/** Puts the recipe back to how a recorded change found it and records that as a new change (so it can be undone like any other), in one transaction that re-reads the recipe and the entry: it refuses when the recipe was saved since the screen showed it or the entry is gone or kept no snapshot. Writes the same fields an undo does. */
export const goBackToChange = createAsyncThunk<
  void,
  GoBackToChangeInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/recipes/goBackToChange',
  async (
    { uid, recipeId, noteId, seenUpdatedAt },
    { getState, rejectWithValue },
  ) => {
    const targetRef = doc(
      db,
      'apps',
      'pinch',
      'kitchens',
      uid,
      'notes',
      noteId,
    );
    const newRef = doc(
      db,
      'apps',
      'pinch',
      'kitchens',
      uid,
      'notes',
      generateUuid(),
    );
    try {
      await freezeBeforeEdit(uid, getState());
      const refusal = await runHeldTransaction(uid, async (transaction) => {
        const recipeSnapshot = await transaction.get(recipeDoc(uid, recipeId));
        const targetSnapshot = await transaction.get(targetRef);
        const target = targetSnapshot.exists()
          ? (targetSnapshot.data() as RecipeNote)
          : null;
        const now = Date.now();
        const plan = planGoBack({
          recipe: recipeSnapshot.exists()
            ? { ...(recipeSnapshot.data() as Recipe), id: recipeId }
            : null,
          target,
          seenUpdatedAt,
          newId: newRef.id,
          dayLabel: formatDateShort(target?.createdAt ?? now),
          now,
        });
        if (plan.kind === 'REFUSE') return plan.message;

        transaction.update(recipeDoc(uid, recipeId), {
          ...plan.fields,
          updatedAt: now,
        });
        transaction.set(newRef, plan.entry);
        return null;
      });
      if (refusal !== null) return rejectWithValue(refusal);
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to go back to before this change.'),
      );
    }

    return undefined;
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
