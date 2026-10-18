import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  COLLECTION_NOUN,
  MAX_COLLECTION_LABEL_LENGTH,
} from '@apps/pinch/constants';
import {
  findCollectionByLabel,
  getRemovalChunks,
  withoutCollection,
} from '@apps/pinch/utils/collections';

const collectionDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'collections', id);

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

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

/** A field-scoped write: the recipes name it by id, so every one follows the new name. */
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
  /** How many recipes it was really taken off, as read inside the transactions. */
  recipeCount: number;
}

/** Takes the collection off every recipe that names it, a transaction per chunk that re-reads each recipe and writes only those still naming it (a recipe's `updatedAt` is left alone: it versions the cover), then deletes the collection itself, so a chunk that fails leaves it in place to be deleted again. */
export const removeCollection = createAsyncThunk<
  RemoveCollectionResult,
  RemoveCollectionInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/collections/remove',
  async ({ uid, id }, { getState, rejectWithValue }) => {
    const chunks = getRemovalChunks(getState().pinch.recipes.items, id);

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
