import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { WeightEntry } from '@apps/nine-lives/types';

import {
  removeWeightEntry,
  revertWeightEntry,
  upsertWeightEntry,
} from '../slices/weightEntriesSlice';

function normalizeWeightEntryInput(value: Partial<WeightEntry>): Partial<WeightEntry> {
  const next = { ...value };

  if (next.linkedVisitId === undefined) {
    next.linkedVisitId = null;
  }

  return next;
}

const getWeightEntryDocRef = (
  householdId: string,
  catId: string,
  weightEntryId: string,
) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'weightEntries',
    weightEntryId,
  );

export const createWeightEntry = createAsyncThunk<
  WeightEntry,
  {
    householdId: string;
    catId: string;
    uid: string;
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/weightEntries/create',
  async ({ householdId, catId, uid, weightEntry }, { dispatch }) => {
    const now = Date.now();
    const weightEntryId =
      weightEntry.id ??
      doc(
        collection(
          db,
          'apps',
          'nine-lives',
          'households',
          householdId,
          'cats',
          catId,
          'weightEntries',
        ),
      ).id;

    const nextWeightEntry: WeightEntry = {
      id: weightEntryId,
      catId,
      weight: weightEntry.weight,
      unit: weightEntry.unit,
      measuredAt: weightEntry.measuredAt,
      linkedVisitId: weightEntry.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: now,
    };

    await setDoc(
      getWeightEntryDocRef(householdId, catId, weightEntryId),
      nextWeightEntry,
    );
    dispatch(upsertWeightEntry(nextWeightEntry));

    return nextWeightEntry;
  },
);

export const updateWeightEntry = createAsyncThunk<
  WeightEntry,
  {
    householdId: string;
    catId: string;
    weightEntryId: string;
    changes: Partial<WeightEntry>;
  },
  { rejectValue: string }
>(
  'nineLives/weightEntries/update',
  async (
    { householdId, catId, weightEntryId, changes },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.weightEntries.items.find(
      (item) => item.id === weightEntryId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Weight entry not found.');
    }

    const sanitizedChanges = normalizeWeightEntryInput(changes);
    const nextWeightEntry: WeightEntry = {
      ...current,
      ...sanitizedChanges,
      id: weightEntryId,
      catId,
    };

    dispatch(upsertWeightEntry(nextWeightEntry));

    try {
      await updateDoc(getWeightEntryDocRef(householdId, catId, weightEntryId), sanitizedChanges);
      return nextWeightEntry;
    } catch (error) {
      dispatch(revertWeightEntry({ id: weightEntryId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update weight entry.',
      );
    }
  },
);

export const deleteWeightEntry = createAsyncThunk<
  { id: string },
  { householdId: string; catId: string; weightEntryId: string },
  { rejectValue: string }
>(
  'nineLives/weightEntries/delete',
  async ({ householdId, catId, weightEntryId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.weightEntries.items.find(
      (item) => item.id === weightEntryId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Weight entry not found.');
    }

    dispatch(removeWeightEntry({ id: weightEntryId }));

    try {
      await deleteDoc(getWeightEntryDocRef(householdId, catId, weightEntryId));
      return { id: weightEntryId };
    } catch (error) {
      dispatch(revertWeightEntry({ id: weightEntryId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete weight entry.',
      );
    }
  },
);
