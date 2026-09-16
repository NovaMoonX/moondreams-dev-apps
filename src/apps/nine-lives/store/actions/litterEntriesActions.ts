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

  if (next.refillWeight === undefined) {
    next.refillWeight = null;
  }

  if (next.isFullChange === undefined) {
    next.isFullChange = false;
  }

  if (next.refillWeight === null) {
    next.isFullChange = false;
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
      Pick<LitterEntry, 'litterBoxId' | 'litterId' | 'weightBefore' | 'weightUnit' | 'loggedAt'>;
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
      litterBoxId: litterEntry.litterBoxId,
      litterId: litterEntry.litterId,
      weightBefore: Number(litterEntry.weightBefore),
      weightUnit: litterEntry.weightUnit,
      refillWeight: normalizedEntry.refillWeight == null ? null : Number(normalizedEntry.refillWeight),
      isFullChange: normalizedEntry.isFullChange ?? false,
      loggedAt: litterEntry.loggedAt,
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
      weightBefore: Number(sanitizedChanges.weightBefore ?? current.weightBefore),
      refillWeight:
        'refillWeight' in changes
          ? sanitizedChanges.refillWeight == null
            ? null
            : Number(sanitizedChanges.refillWeight)
          : current.refillWeight,
      isFullChange: 'isFullChange' in changes ? Boolean(sanitizedChanges.isFullChange) : current.isFullChange,
      notes: 'notes' in changes ? sanitizedChanges.notes ?? null : current.notes,
      lastEditedAt: Date.now(),
    };

    if (nextEntry.refillWeight === null) {
      nextEntry.isFullChange = false;
    }

    dispatch(upsertLitterEntry(nextEntry));

    try {
      await updateDoc(getLitterEntryDocRef(householdId, entryId), {
        ...sanitizedChanges,
        weightBefore: nextEntry.weightBefore,
        refillWeight: nextEntry.refillWeight,
        isFullChange: nextEntry.isFullChange,
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
