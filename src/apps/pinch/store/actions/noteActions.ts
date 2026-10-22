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
  getStepAnchor,
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

const GONE_STEP = 'That step is gone, so the entry cannot follow it.';

/** The reason a CHANGE keeps: its words trimmed, null when there are none; any other kind keeps none. */
const getReason = (kind: RecipeNote['kind'], reason: string | null) => {
  const trimmed = kind === 'CHANGE' ? (reason ?? '').trim() : '';
  return trimmed === '' ? null : trimmed;
};

const getAddProblem = (
  state: RootState,
  input: Pick<
    AddNoteInput,
    'recipeId' | 'kind' | 'text' | 'reason' | 'cookId' | 'stepIndex'
  >,
) => {
  const { recipeId, kind, text, reason, cookId, stepIndex } = input;
  const { isLoaded, loadError, items } = state.pinch.notes;
  if (loadError !== null) {
    return "Your recipe notes couldn't load, so adding is paused.";
  }
  if (!isLoaded) {
    return 'Your recipe notes are still loading. Try again in a moment.';
  }
  const recipe = state.pinch.recipes.items.find(
    (entry) => entry.id === recipeId,
  );
  if (!recipe) {
    return 'This recipe is gone, so there is nothing to add to.';
  }
  if (!isValidNoteText(text)) return BAD_TEXT;
  if ((reason ?? '').trim().length > MAX_RECIPE_NOTE_LENGTH) return BAD_TEXT;
  if (stepIndex !== null && recipe.steps[stepIndex] === undefined) {
    return GONE_STEP;
  }
  if (
    kind === 'NOTE' &&
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
  /** A tip, a planned change or a note; a tweak is written by saving the recipe. */
  kind: 'NOTE' | 'TIP' | 'CHANGE';
  /** The words; for a change, what to change. */
  text: string;
  /** Why the change; only a change keeps it. */
  reason: string | null;
  /** The cook a note follows up, or null. A tip and a change never follow one. */
  cookId: string | null;
  /** The step it is about (0-based), or null for the whole recipe. */
  stepIndex: number | null;
}

export const addNote = createAsyncThunk<
  string,
  AddNoteInput,
  { state: RootState; rejectValue: string }
>('pinch/notes/add', async (input, { getState, rejectWithValue }) => {
  const { uid, recipeId, kind, text, stepIndex } = input;
  const state = getState();
  const problem = getAddProblem(state, input);
  if (problem !== null) return rejectWithValue(problem);

  const steps =
    state.pinch.recipes.items.find((recipe) => recipe.id === recipeId)?.steps ??
    [];
  const now = Date.now();
  const note: RecipeNote = {
    id: generateUuid(),
    recipeId,
    kind,
    text: text.trim(),
    changes: [],
    cookId: kind === 'NOTE' ? input.cookId : null,
    ...getStepAnchor(steps, stepIndex),
    reason: getReason(kind, input.reason),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(noteDoc(uid, note.id), note);
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this entry.'));
  }

  return note.id;
});

interface UpdateNoteInput {
  uid: string;
  id: string;
  text: string;
  /** A change's why; ignored for every other kind. Leave out to keep it as it is. */
  reason?: string | null;
  /** Moves the entry to this step (0-based) or to the whole recipe (null); leave out to keep it where it is. A tweak has no step. */
  stepIndex?: number | null;
}

/** The words, a change's reason and the step, with `updatedAt`: a tweak's record of what changed is history, and an entry's cook and date stay as they were. */
export const updateNote = createAsyncThunk<
  string,
  UpdateNoteInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/notes/update',
  async ({ uid, id, text, reason, stepIndex }, { getState, rejectWithValue }) => {
    const state = getState();
    const existing = state.pinch.notes.items.find((note) => note.id === id);
    if (!existing) {
      return rejectWithValue('This entry is gone, so there is nothing to save.');
    }
    const isTweak = existing.kind === 'TWEAK';
    if (text.trim().length > MAX_RECIPE_NOTE_LENGTH) {
      return rejectWithValue(BAD_TEXT);
    }
    if (!isTweak && !isValidNoteText(text)) return rejectWithValue(BAD_TEXT);
    if ((reason ?? '').trim().length > MAX_RECIPE_NOTE_LENGTH) {
      return rejectWithValue(BAD_TEXT);
    }
    const steps =
      state.pinch.recipes.items.find((recipe) => recipe.id === existing.recipeId)
        ?.steps ?? [];
    if (
      !isTweak &&
      stepIndex !== undefined &&
      stepIndex !== null &&
      steps[stepIndex] === undefined
    ) {
      return rejectWithValue(GONE_STEP);
    }

    try {
      await updateDoc(noteDoc(uid, id), {
        ...getMissingNoteFields(existing),
        text: isTweak ? getTweakReason(text) : text.trim(),
        ...(existing.kind === 'CHANGE' && reason !== undefined
          ? { reason: getReason('CHANGE', reason) }
          : {}),
        ...(!isTweak && stepIndex !== undefined
          ? getStepAnchor(steps, stepIndex)
          : {}),
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
