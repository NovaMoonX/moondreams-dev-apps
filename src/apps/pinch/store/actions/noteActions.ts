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
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_RECIPE_NOTE_LENGTH,
  RECIPE_NOTE_BATCH_SIZE,
  SOFT_MAX_RECIPE_NOTES,
} from '@apps/pinch/constants';
import type { RecipeNote } from '@apps/pinch/types';
import {
  getMissingNoteFields,
  getTweakReason,
  isNoteHistoryFull,
  isValidNoteText,
} from '@apps/pinch/utils/notes';

const noteDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'notes', id);

const BAD_TEXT = `Write something to save, up to ${MAX_RECIPE_NOTE_LENGTH.toLocaleString('en-US')} characters.`;
const FULL = `A recipe's notes hold up to ${SOFT_MAX_RECIPE_NOTES} entries. Delete an older one to make room.`;

const OFFLINE_MESSAGE = 'Check your connection and try again.';

const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch note write failed', error);
    return error.code === 'unavailable' || !navigator.onLine
      ? OFFLINE_MESSAGE
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

const getAddProblem = (
  state: RootState,
  recipeId: string,
  text: string,
  cookId: string | null,
) => {
  const { isLoaded, loadError, items } = state.pinch.notes;
  if (loadError !== null) {
    return "Your recipe notes couldn't load, so adding is paused.";
  }
  if (!isLoaded) {
    return 'Your recipe notes are still loading. Try again in a moment.';
  }
  if (!state.pinch.recipes.items.some((recipe) => recipe.id === recipeId)) {
    return 'This recipe is gone, so there is nothing to add to.';
  }
  if (!isValidNoteText(text)) return BAD_TEXT;
  if (
    cookId !== null &&
    !state.pinch.cooks.items.some(
      (cook) => cook.id === cookId && cook.recipeId === recipeId,
    )
  ) {
    return "That cook is gone, so the note can't follow it up.";
  }
  const count = items.filter((note) => note.recipeId === recipeId).length;
  return isNoteHistoryFull(count) ? FULL : null;
};

interface AddNoteInput {
  uid: string;
  recipeId: string;
  text: string;
  /** The cook this follows up, or null for a note about the recipe. */
  cookId: string | null;
}

export const addNote = createAsyncThunk<
  string,
  AddNoteInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/notes/add',
  async ({ uid, recipeId, text, cookId }, { getState, rejectWithValue }) => {
    const problem = getAddProblem(getState(), recipeId, text, cookId);
    if (problem !== null) return rejectWithValue(problem);

    const now = Date.now();
    const note: RecipeNote = {
      id: generateUuid(),
      recipeId,
      kind: 'NOTE',
      text: text.trim(),
      changes: [],
      cookId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(noteDoc(uid, note.id), note);
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this note.'),
      );
    }

    return note.id;
  },
);

interface UpdateNoteInput {
  uid: string;
  id: string;
  text: string;
}

/** Only the text and `updatedAt`: a tweak's record of what changed is history, and a note's cook and date stay as they were. */
export const updateNote = createAsyncThunk<
  string,
  UpdateNoteInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/notes/update',
  async ({ uid, id, text }, { getState, rejectWithValue }) => {
    const existing = getState().pinch.notes.items.find(
      (note) => note.id === id,
    );
    if (!existing) {
      return rejectWithValue('This note is gone, so there is nothing to save.');
    }
    const isTweak = existing.kind === 'TWEAK';
    if (text.trim().length > MAX_RECIPE_NOTE_LENGTH) {
      return rejectWithValue(BAD_TEXT);
    }
    if (!isTweak && !isValidNoteText(text)) return rejectWithValue(BAD_TEXT);

    try {
      await updateDoc(noteDoc(uid, id), {
        ...getMissingNoteFields(existing),
        text: isTweak ? getTweakReason(text) : text.trim(),
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

interface RemoveNoteInput {
  uid: string;
  id: string;
}

export const removeNote = createAsyncThunk<
  string,
  RemoveNoteInput,
  { rejectValue: string }
>('pinch/notes/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(noteDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete this note.'),
    );
  }

  return id;
});

/** Reads the recipe's notes from Firestore, since the store is empty while they load or after they fail to. A failure is the caller's to ignore: a note whose recipe is gone is never read. */
export async function deleteNotes(uid: string, recipeId: string) {
  const { docs } = await getDocs(
    query(
      collection(db, 'apps', 'pinch', 'kitchens', uid, 'notes'),
      where('recipeId', '==', recipeId),
    ),
  );
  const groups = Array.from(
    { length: Math.ceil(docs.length / RECIPE_NOTE_BATCH_SIZE) },
    (_, index) =>
      docs.slice(
        index * RECIPE_NOTE_BATCH_SIZE,
        (index + 1) * RECIPE_NOTE_BATCH_SIZE,
      ),
  );

  await Promise.all(
    groups.map((group) => {
      const batch = writeBatch(db);
      group.forEach((note) => batch.delete(note.ref));
      return batch.commit();
    }),
  );
}
