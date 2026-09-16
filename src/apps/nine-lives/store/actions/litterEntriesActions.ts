import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { LitterEntry } from '@apps/nine-lives/types';

import {
  removeLitterEntry,
  revertLitterEntry,
  upsertLitterEntry,
} from '../slices/litterEntriesSlice';

function normalizeLitterEntryInput(value: Partial<LitterEntry>): Partial<LitterEntry> {
  const next = { ...value };

  if (next.customLitterType === undefined) {
    next.customLitterType = null;
  }

  if (next.cost === undefined) {
    next.cost = null;
  }

  if (next.changedAt === undefined) {
    next.changedAt = null;
  }

  if (next.notes === undefined) {
    next.notes = null;
  }

  return next;
}

const getLitterEntryDocRef = (householdId: string, entryId: string) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'litterEntries',
    entryId,
  );

export const createLitterEntry = createAsyncThunk<
  LitterEntry,
  {
    householdId: string;
    uid: string;
    litterEntry: Partial<LitterEntry> &
      Pick<LitterEntry, 'litterBoxName' | 'litterType' | 'weight' | 'weightUnit' | 'loggedAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/litterEntries/create',
  async ({ householdId, uid, litterEntry }, { dispatch }) => {
    const normalizedEntry = normalizeLitterEntryInput(litterEntry);
    const now = Date.now();
    const entryId =
      normalizedEntry.id ??
      doc(
        collection(
          db,
          'apps',
          'nine-lives',
          'households',
          householdId,
          'litterEntries',
        ),
      ).id;

    const nextEntry: LitterEntry = {
      id: entryId,
      householdId,
      litterBoxName: litterEntry.litterBoxName.trim(),
      litterType: litterEntry.litterType,
      customLitterType: normalizedEntry.customLitterType ?? null,
      weight: Number(litterEntry.weight),
      weightUnit: litterEntry.weightUnit,
      cost: normalizedEntry.cost == null ? null : Number(normalizedEntry.cost),
      loggedAt: litterEntry.loggedAt,
      changedAt: normalizedEntry.changedAt ?? null,
      notes: normalizedEntry.notes ?? null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getLitterEntryDocRef(householdId, entryId), nextEntry);
    dispatch(upsertLitterEntry(nextEntry));

    return nextEntry;
  },
);

export const updateLitterEntry = createAsyncThunk<
  LitterEntry,
  {
    householdId: string;
    entryId: string;
    changes: Partial<LitterEntry>;
  },
  { rejectValue: string }
>(
  'nineLives/litterEntries/update',
  async ({ householdId, entryId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litterEntries.items.find((entry) => entry.id === entryId);

    if (!current) {
      return rejectWithValue('Litter entry not found.');
    }

    const sanitizedChanges = normalizeLitterEntryInput(changes);
    const nextEntry: LitterEntry = {
      ...current,
      ...sanitizedChanges,
      id: entryId,
      householdId,
      litterBoxName: sanitizedChanges.litterBoxName?.trim() || current.litterBoxName,
      weight: Number(sanitizedChanges.weight ?? current.weight),
      cost:
        'cost' in changes
          ? sanitizedChanges.cost === null
            ? null
            : Number(sanitizedChanges.cost)
          : current.cost,
      changedAt:
        'changedAt' in changes ? sanitizedChanges.changedAt ?? null : current.changedAt,
      customLitterType:
        'customLitterType' in changes
          ? sanitizedChanges.customLitterType ?? null
          : current.customLitterType,
      notes: 'notes' in changes ? sanitizedChanges.notes ?? null : current.notes,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertLitterEntry(nextEntry));

    try {
      await updateDoc(getLitterEntryDocRef(householdId, entryId), {
        ...sanitizedChanges,
        litterBoxName: nextEntry.litterBoxName,
        cost: nextEntry.cost,
        changedAt: nextEntry.changedAt,
        customLitterType: nextEntry.customLitterType,
        notes: nextEntry.notes,
        lastEditedAt: nextEntry.lastEditedAt,
      });
      return nextEntry;
    } catch (error) {
      dispatch(revertLitterEntry({ id: entryId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update litter entry.',
      );
    }
  },
);

export const deleteLitterEntry = createAsyncThunk<
  { id: string },
  { householdId: string; entryId: string },
  { rejectValue: string }
>(
  'nineLives/litterEntries/delete',
  async ({ householdId, entryId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litterEntries.items.find((entry) => entry.id === entryId);

    if (!current) {
      return rejectWithValue('Litter entry not found.');
    }

    dispatch(removeLitterEntry({ id: entryId }));

    try {
      await deleteDoc(getLitterEntryDocRef(householdId, entryId));
      return { id: entryId };
    } catch (error) {
      dispatch(revertLitterEntry({ id: entryId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete litter entry.',
      );
    }
  },
);
