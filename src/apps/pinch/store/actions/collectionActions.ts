import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  COLLECTION_NOUN,
  MAX_COLLECTION_LABEL_LENGTH,
} from '@apps/pinch/constants';
import {
  selectCollectionsById,
  selectTweakTracking,
} from '@apps/pinch/store/selectors';
import type { Collection } from '@apps/pinch/types';
import { getOutsideTweak } from '@apps/pinch/utils/notes';
import { capLines } from '@apps/pinch/utils/recipeChanges';
import {
  findCollectionByLabel,
  getChunks,
  getRemovalChunks,
  planAddToCollections,
  planRemoveFromCollections,
  withoutCollection,
} from '@apps/pinch/utils/collections';

const collectionDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'collections', id);

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

const noteDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'notes', id);

const OFFLINE_MESSAGE = 'Check your connection and try again.';

const getWriteMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof FirebaseError)) {
    return getErrorMessage(error, fallback);
  }
  console.error('Pinch collection write failed', error);
  return error.code === 'unavailable' || !navigator.onLine
    ? OFFLINE_MESSAGE
    : fallback;
};

const BAD_LABEL = `A ${COLLECTION_NOUN}'s name needs 1 to ${MAX_COLLECTION_LABEL_LENGTH} characters.`;

interface RenameCollectionInput {
  uid: string;
  id: string;
  label: string;
}

export const renameCollection = createAsyncThunk<
  string,
  RenameCollectionInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/collections/rename',
  async ({ uid, id, label }, { getState, rejectWithValue }) => {
    const trimmed = label.trim();
    if (trimmed === '' || trimmed.length > MAX_COLLECTION_LABEL_LENGTH) {
      return rejectWithValue(BAD_LABEL);
    }

    const { items } = getState().pinch.collections;
    const existing = items.find((collection) => collection.id === id);
    if (!existing) {
      return rejectWithValue(
        `This ${COLLECTION_NOUN} is gone, so there is nothing to save.`,
      );
    }
    const duplicate = findCollectionByLabel(items, trimmed, id);
    if (duplicate) {
      return rejectWithValue(
        `You already have a ${COLLECTION_NOUN} called “${duplicate.label}”.`,
      );
    }
    if (existing.label === trimmed) {
      return id;
    }

    try {
      await updateDoc(collectionDoc(uid, id), {
        label: trimmed,
        updatedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, `Unable to save this ${COLLECTION_NOUN}.`),
      );
    }

    return id;
  },
);

interface RemoveCollectionInput {
  uid: string;
  id: string;
}

interface RemoveCollectionResult {
  id: string;
  recipeCount: number;
}

/** The collection document goes last, so a failed chunk leaves it to be deleted again; a recipe's `updatedAt` stays because it versions the cover, and one with cooks gets the change in its history in the same transaction. */
export const removeCollection = createAsyncThunk<
  RemoveCollectionResult,
  RemoveCollectionInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/collections/remove',
  async ({ uid, id }, { getState, rejectWithValue }) => {
    const chunks = getRemovalChunks(getState().pinch.recipes.items, id);
    const state = getState();
    const label = selectCollectionsById(state).get(id)?.label ?? 'a';
    const now = Date.now();

    try {
      const counts = await Promise.all(
        chunks.map((recipeIds) =>
          runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              recipeIds.map((recipeId) =>
                transaction.get(recipeDoc(uid, recipeId)),
              ),
            );

            return snapshots.reduce((count, snapshot) => {
              const next = snapshot.exists()
                ? withoutCollection(snapshot.data().collectionIds, id)
                : null;
              if (next === null) return count;
              transaction.update(snapshot.ref, { collectionIds: next });
              if (selectTweakTracking(state, snapshot.id) === 'on') {
                const note = getOutsideTweak({
                  id: generateUuid(),
                  recipeId: snapshot.id,
                  changes: [
                    `Taken out of the ${label} ${COLLECTION_NOUN}, which was deleted`,
                  ],
                  now,
                });
                transaction.set(noteDoc(uid, note.id), note);
              }
              return count + 1;
            }, 0);
          }),
        ),
      );
      await deleteDoc(collectionDoc(uid, id));

      return {
        id,
        recipeCount: counts.reduce((sum, count) => sum + count, 0),
      };
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, `Unable to delete this ${COLLECTION_NOUN}.`),
      );
    }
  },
);

interface AddToCollectionsInput {
  uid: string;
  recipeIds: string[];
  /** Every collection to add them to, the new ones among them. */
  collectionIds: string[];
  /** Typed in the picker: written in the first chunk's transaction, so a failed act leaves none behind. */
  newCollections: { id: string; label: string }[];
}

export interface AddedToRecipe {
  id: string;
  /** The collections this act put on it: all an Undo takes off. */
  added: string[];
  /** The history entry the act wrote for it, which an Undo takes off too; null for a recipe with no cooks. */
  noteId: string | null;
}

interface AddToCollectionsResult {
  changed: AddedToRecipe[];
  alreadyIn: number;
  atCap: number;
  gone: number;
  /** The new collections that now exist because of this act. */
  createdIds: string[];
  /** Set when a later chunk failed after earlier ones were written. */
  error: string | null;
}

const NO_PROGRESS: Omit<AddToCollectionsResult, 'createdIds'> = {
  changed: [],
  alreadyIn: 0,
  atCap: 0,
  gone: 0,
  error: null,
};

/** Adds the collections to each recipe, 200 recipes to a transaction that re-reads them and merges into the stored list under the cap of 20 a recipe may be in; a recipe's `updatedAt` stays because it versions the cover. */
export const addRecipesToCollections = createAsyncThunk<
  AddToCollectionsResult,
  AddToCollectionsInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/collections/addRecipes',
  async (
    { uid, recipeIds, collectionIds, newCollections },
    { getState, rejectWithValue },
  ) => {
    const now = Date.now();
    const state = getState();
    const labels = new Map([
      ...[...selectCollectionsById(state)].map(
        ([key, collection]) => [key, collection.label] as const,
      ),
      ...newCollections.map((entry) => [entry.id, entry.label] as const),
    ]);
    const progress = await getChunks(recipeIds).reduce(
      async (previous, chunk, index) => {
        const soFar = await previous;
        if (soFar.error !== null) return soFar;

        try {
          const part = await runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              chunk.map((id) => transaction.get(recipeDoc(uid, id))),
            );
            if (index === 0) {
              newCollections.forEach((entry) => {
                const collection: Collection = {
                  id: entry.id,
                  label: entry.label,
                  createdAt: now,
                  updatedAt: now,
                };
                transaction.set(collectionDoc(uid, entry.id), collection);
              });
            }

            return snapshots.reduce(
              (acc, snapshot) => {
                if (!snapshot.exists()) return { ...acc, gone: acc.gone + 1 };

                const plan = planAddToCollections(
                  snapshot.data().collectionIds,
                  collectionIds,
                );
                const note =
                  plan.next !== null &&
                  selectTweakTracking(state, snapshot.id) === 'on'
                    ? getOutsideTweak({
                        id: generateUuid(),
                        recipeId: snapshot.id,
                        changes: capLines(
                          plan.added.map(
                            (added) =>
                              `Added to the ${labels.get(added) ?? 'a'} ${COLLECTION_NOUN}`,
                          ),
                        ),
                        now,
                      })
                    : null;
                if (plan.next !== null) {
                  transaction.update(snapshot.ref, {
                    collectionIds: plan.next,
                  });
                }
                if (note) transaction.set(noteDoc(uid, note.id), note);
                return {
                  changed:
                    plan.next === null
                      ? acc.changed
                      : [
                          ...acc.changed,
                          {
                            id: snapshot.id,
                            added: plan.added,
                            noteId: note?.id ?? null,
                          },
                        ],
                  alreadyIn:
                    acc.alreadyIn +
                    (plan.next === null && !plan.isAtCap ? 1 : 0),
                  atCap: acc.atCap + (plan.isAtCap ? 1 : 0),
                  gone: acc.gone,
                };
              },
              {
                changed: [] as AddedToRecipe[],
                alreadyIn: 0,
                atCap: 0,
                gone: 0,
              },
            );
          });
          return {
            changed: [...soFar.changed, ...part.changed],
            alreadyIn: soFar.alreadyIn + part.alreadyIn,
            atCap: soFar.atCap + part.atCap,
            gone: soFar.gone + part.gone,
            error: null,
          };
        } catch (error) {
          return {
            ...soFar,
            error: getWriteMessage(error, "Couldn't save that."),
          };
        }
      },
      Promise.resolve(NO_PROGRESS),
    );

    if (progress.changed.length === 0) {
      await Promise.all(
        newCollections.map((entry) =>
          deleteDoc(collectionDoc(uid, entry.id)).catch(() => undefined),
        ),
      );
    }
    if (progress.error !== null && progress.changed.length === 0) {
      return rejectWithValue(progress.error);
    }

    return {
      ...progress,
      createdIds:
        progress.changed.length > 0
          ? newCollections.map((entry) => entry.id)
          : [],
      error:
        progress.error === null
          ? null
          : `${progress.changed.length} changed before it stopped. ${progress.error}`,
    };
  },
);

interface UndoAddToCollectionsInput {
  uid: string;
  changed: AddedToRecipe[];
  createdIds: string[];
}

interface UndoAddToCollectionsResult {
  restored: number;
  error: string | null;
}

/** Takes off each recipe only the collections the act added, from the list as it is now; a collection the act created goes too, once no recipe is in it. */
export const undoAddToCollections = createAsyncThunk<
  UndoAddToCollectionsResult,
  UndoAddToCollectionsInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/collections/undoAddRecipes',
  async ({ uid, changed, createdIds }, { getState, rejectWithValue }) => {
    const progress = await getChunks(changed).reduce(
      async (previous, chunk) => {
        const soFar = await previous;
        if (soFar.error !== null) return soFar;

        try {
          const restored = await runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              chunk.map(({ id }) => transaction.get(recipeDoc(uid, id))),
            );

            return snapshots.reduce((count, snapshot, index) => {
              const next = snapshot.exists()
                ? planRemoveFromCollections(
                    snapshot.data().collectionIds,
                    chunk[index].added,
                  )
                : null;
              if (next === null) return count;
              transaction.update(snapshot.ref, { collectionIds: next });
              const { noteId } = chunk[index];
              if (noteId !== null) transaction.delete(noteDoc(uid, noteId));
              return count + 1;
            }, 0);
          });
          return { restored: soFar.restored + restored, error: null };
        } catch (error) {
          return {
            ...soFar,
            error: getWriteMessage(error, "Couldn't undo that."),
          };
        }
      },
      Promise.resolve({ restored: 0, error: null as string | null }),
    );

    if (progress.error !== null && progress.restored === 0) {
      return rejectWithValue(progress.error);
    }

    // The listener may not have caught up with the writes yet, so the recipes this Undo just took it off are not asked.
    const undoneIds = new Set(changed.map(({ id }) => id));
    const { items } = getState().pinch.recipes;
    const isUsed = (collectionId: string) =>
      items.some(
        (recipe) =>
          !undoneIds.has(recipe.id) &&
          (recipe.collectionIds ?? []).includes(collectionId),
      );
    if (progress.error === null) {
      await Promise.all(
        createdIds
          .filter((id) => !isUsed(id))
          .map((id) =>
            deleteDoc(collectionDoc(uid, id)).catch(() => undefined),
          ),
      );
    }

    return progress;
  },
);
