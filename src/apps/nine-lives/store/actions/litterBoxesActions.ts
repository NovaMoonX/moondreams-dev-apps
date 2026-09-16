import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { LitterBox } from '@apps/nine-lives/types';

import {
  removeLitterBox,
  revertLitterBox,
  upsertLitterBox,
} from '../slices/litterBoxesSlice';

const getLitterBoxDocRef = (householdId: string, litterBoxId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'litterBoxes', litterBoxId);

export const createLitterBox = createAsyncThunk<
  LitterBox,
  {
    householdId: string;
    uid: string;
    litterBox: Partial<LitterBox> & Pick<LitterBox, 'name'>;
  },
  { rejectValue: string }
>(
  'nineLives/litterBoxes/create',
  async ({ householdId, uid, litterBox }, { dispatch, rejectWithValue }) => {
    const trimmedName = litterBox.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Litter box name is required.');
    }

    const litterBoxId =
      litterBox.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'litterBoxes')).id;
    const now = Date.now();

    const nextLitterBox: LitterBox = {
      id: litterBoxId,
      householdId,
      name: trimmedName,
      location: litterBox.location?.trim() || null,
      createdBy: uid,
      createdAt: litterBox.createdAt ?? now,
      lastEditedAt: now,
    };

    await setDoc(getLitterBoxDocRef(householdId, litterBoxId), nextLitterBox);
    dispatch(upsertLitterBox(nextLitterBox));

    return nextLitterBox;
  },
);

export const updateLitterBox = createAsyncThunk<
  LitterBox,
  { householdId: string; litterBoxId: string; changes: Partial<LitterBox> },
  { rejectValue: string }
>(
  'nineLives/litterBoxes/update',
  async ({ householdId, litterBoxId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litterBoxes.items.find(
      (litterBox) => litterBox.id === litterBoxId,
    );

    if (!current) {
      return rejectWithValue('Litter box not found.');
    }

    const sanitizedChanges = { ...changes };

    if (sanitizedChanges.name !== undefined) {
      sanitizedChanges.name = sanitizedChanges.name.trim() || current.name;
    }

    if (sanitizedChanges.location !== undefined) {
      sanitizedChanges.location = sanitizedChanges.location?.trim() || null;
    }

    const nextLitterBox: LitterBox = {
      ...current,
      ...sanitizedChanges,
      id: litterBoxId,
      householdId,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertLitterBox(nextLitterBox));

    try {
      await updateDoc(getLitterBoxDocRef(householdId, litterBoxId), {
        ...sanitizedChanges,
        lastEditedAt: nextLitterBox.lastEditedAt,
      });
      return nextLitterBox;
    } catch (error) {
      dispatch(revertLitterBox({ id: litterBoxId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update litter box.',
      );
    }
  },
);

export const deleteLitterBox = createAsyncThunk<
  { id: string },
  { householdId: string; litterBoxId: string },
  { rejectValue: string }
>(
  'nineLives/litterBoxes/delete',
  async ({ householdId, litterBoxId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litterBoxes.items.find(
      (litterBox) => litterBox.id === litterBoxId,
    );

    if (!current) {
      return rejectWithValue('Litter box not found.');
    }

    dispatch(removeLitterBox({ id: litterBoxId }));

    try {
      await deleteDoc(getLitterBoxDocRef(householdId, litterBoxId));
      return { id: litterBoxId };
    } catch (error) {
      dispatch(revertLitterBox({ id: litterBoxId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete litter box.',
      );
    }
  },
);
