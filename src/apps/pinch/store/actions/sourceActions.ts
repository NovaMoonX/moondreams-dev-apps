import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_SOURCE_LABEL_LENGTH,
  SOURCE_BATCH_SIZE,
} from '@apps/pinch/constants';
import type { Source } from '@apps/pinch/types';
import { findSourceByLabel } from '@apps/pinch/utils/sources';

const sourceDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'sources', id);

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

const isValidLabel = (label: string) =>
  label !== '' && label.length <= MAX_SOURCE_LABEL_LENGTH;

const BAD_LABEL = `A source's name needs 1 to ${MAX_SOURCE_LABEL_LENGTH} characters.`;

interface CreateSourceInput {
  uid: string;
  label: string;
}

/** Adds a source, or returns the id of the one that already has this label (ignoring case): it is checked against the loaded list only, so two devices adding the same label at once can leave two. */
export const createSource = createAsyncThunk<
  string,
  CreateSourceInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/sources/create',
  async ({ uid, label }, { getState, rejectWithValue }) => {
    const trimmed = label.trim();
    if (!isValidLabel(trimmed)) {
      return rejectWithValue(BAD_LABEL);
    }

    const existing = findSourceByLabel(getState().pinch.sources.items, trimmed);
    if (existing) {
      return existing.id;
    }

    try {
      const now = Date.now();
      const source: Source = {
        id: generateUuid(),
        label: trimmed,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(sourceDoc(uid, source.id), source);
      return source.id;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this source.'),
      );
    }
  },
);

interface RenameSourceInput {
  uid: string;
  id: string;
  label: string;
}

/** Changes only the label (and when), refusing one another source already has. */
export const renameSource = createAsyncThunk<
  string,
  RenameSourceInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/sources/rename',
  async ({ uid, id, label }, { getState, rejectWithValue }) => {
    const trimmed = label.trim();
    if (!isValidLabel(trimmed)) {
      return rejectWithValue(BAD_LABEL);
    }

    const { items } = getState().pinch.sources;
    const existing = items.find((source) => source.id === id);
    if (!existing) {
      return rejectWithValue(
        'This source is gone, so there is nothing to save.',
      );
    }
    const duplicate = findSourceByLabel(items, trimmed, id);
    if (duplicate) {
      return rejectWithValue(
        `You already have a source called “${duplicate.label}”.`,
      );
    }
    if (existing.label === trimmed) {
      return id;
    }

    try {
      await updateDoc(sourceDoc(uid, id), {
        label: trimmed,
        updatedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this source.'),
      );
    }

    return id;
  },
);

interface RemoveSourceInput {
  uid: string;
  id: string;
}

/** Deletes the source and clears it from every loaded recipe that names it, in batches under the write limit. A recipe's `updatedAt` is left alone because it versions the cover image. */
export const removeSource = createAsyncThunk<
  string,
  RemoveSourceInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/sources/remove',
  async ({ uid, id }, { getState, rejectWithValue }) => {
    const targets = [
      { ref: sourceDoc(uid, id), isSource: true },
      ...getState()
        .pinch.recipes.items.filter((recipe) => recipe.sourceId === id)
        .map((recipe) => ({ ref: recipeDoc(uid, recipe.id), isSource: false })),
    ];
    const groups = Array.from(
      { length: Math.ceil(targets.length / SOURCE_BATCH_SIZE) },
      (_, index) =>
        targets.slice(
          index * SOURCE_BATCH_SIZE,
          (index + 1) * SOURCE_BATCH_SIZE,
        ),
    );

    try {
      await Promise.all(
        groups.map((group) => {
          const batch = writeBatch(db);
          group.forEach(({ ref, isSource }) =>
            isSource
              ? batch.delete(ref)
              : batch.update(ref, { sourceId: null }),
          );
          return batch.commit();
        }),
      );
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to delete this source.'),
      );
    }

    return id;
  },
);
