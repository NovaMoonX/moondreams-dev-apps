import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_SOURCE_LABEL_LENGTH,
  SOURCE_BATCH_SIZE,
} from '@apps/pinch/constants';
import {
  selectSourcesById,
  selectTweakTracking,
} from '@apps/pinch/store/selectors';
import { getOutsideTweak } from '@apps/pinch/utils/notes';
import { findSourceByLabel } from '@apps/pinch/utils/sources';

const sourceDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'sources', id);

const recipeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'recipes', id);

const noteDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'notes', id);

const isValidLabel = (label: string) =>
  label !== '' && label.length <= MAX_SOURCE_LABEL_LENGTH;

const BAD_LABEL = `A source's name needs 1 to ${MAX_SOURCE_LABEL_LENGTH} characters.`;

interface RenameSourceInput {
  uid: string;
  id: string;
  label: string;
}

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

/** Deletes the source and clears it from every loaded recipe that names it, in batches under the write limit. A recipe's `updatedAt` is left alone because it versions the cover image; a recipe with cooks gets the change in its history, in the same batch. */
export const removeSource = createAsyncThunk<
  string,
  RemoveSourceInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/sources/remove',
  async ({ uid, id }, { getState, rejectWithValue }) => {
    const now = Date.now();
    const label = selectSourcesById(getState()).get(id)?.label ?? 'a source';
    const targets = [
      { ref: sourceDoc(uid, id), isSource: true, note: null },
      ...getState()
        .pinch.recipes.items.filter((recipe) => recipe.sourceId === id)
        .map((recipe) => ({
          ref: recipeDoc(uid, recipe.id),
          isSource: false,
          note:
            selectTweakTracking(getState(), recipe.id) === 'on'
              ? getOutsideTweak({
                  id: generateUuid(),
                  recipeId: recipe.id,
                  changes: [`Source removed: “${label}” was deleted`],
                  now,
                })
              : null,
        })),
    ];
    const groups = Array.from(
      { length: Math.ceil(targets.length / (SOURCE_BATCH_SIZE / 2)) },
      (_, index) =>
        targets.slice(
          index * (SOURCE_BATCH_SIZE / 2),
          (index + 1) * (SOURCE_BATCH_SIZE / 2),
        ),
    );

    try {
      await Promise.all(
        groups.map((group) => {
          const batch = writeBatch(db);
          group.forEach(({ ref, isSource, note }) => {
            if (isSource) {
              batch.delete(ref);
              return;
            }
            batch.update(ref, { sourceId: null });
            if (note) batch.set(noteDoc(uid, note.id), note);
          });
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
