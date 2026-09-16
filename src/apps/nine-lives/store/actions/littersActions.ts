import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Litter } from '@apps/nine-lives/types';

import { removeLitter, revertLitter, upsertLitter } from '../slices/littersSlice';

function normalizeLitterInput(value: Partial<Litter>): Partial<Litter> {
  const next = { ...value };

  if (next.customLitterTypeId === undefined) {
    next.customLitterTypeId = null;
  }

  if (next.cost === undefined) {
    next.cost = null;
  }

  return next;
}

const getLitterDocRef = (householdId: string, litterId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'litters', litterId);

export const createLitter = createAsyncThunk<
  Litter,
  {
    householdId: string;
    uid: string;
    litter: Partial<Litter> & Pick<Litter, 'brand' | 'litterType' | 'weight' | 'weightUnit'>;
  },
  { rejectValue: string }
>(
  'nineLives/litters/create',
  async ({ householdId, uid, litter }, { dispatch }) => {
    const normalized = normalizeLitterInput(litter);
    const now = Date.now();
    const litterId =
      normalized.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'litters')).id;

    const nextLitter: Litter = {
      id: litterId,
      householdId,
      brand: litter.brand.trim(),
      litterType: litter.litterType,
      customLitterTypeId: normalized.customLitterTypeId ?? null,
      weight: Number(litter.weight),
      weightUnit: litter.weightUnit,
      cost: normalized.cost == null ? null : Number(normalized.cost),
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getLitterDocRef(householdId, litterId), nextLitter);
    dispatch(upsertLitter(nextLitter));

    return nextLitter;
  },
);

export const updateLitter = createAsyncThunk<
  Litter,
  { householdId: string; litterId: string; changes: Partial<Litter> },
  { rejectValue: string }
>(
  'nineLives/litters/update',
  async ({ householdId, litterId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litters.items.find((litter) => litter.id === litterId);

    if (!current) {
      return rejectWithValue('Litter not found.');
    }

    const sanitizedChanges = normalizeLitterInput(changes);
    const nextLitter: Litter = {
      ...current,
      ...sanitizedChanges,
      id: litterId,
      householdId,
      brand: sanitizedChanges.brand?.trim() || current.brand,
      weight: Number(sanitizedChanges.weight ?? current.weight),
      cost:
        'cost' in changes
          ? sanitizedChanges.cost === null
            ? null
            : Number(sanitizedChanges.cost)
          : current.cost,
      customLitterTypeId:
        'customLitterTypeId' in changes
          ? sanitizedChanges.customLitterTypeId ?? null
          : current.customLitterTypeId,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertLitter(nextLitter));

    try {
      await updateDoc(getLitterDocRef(householdId, litterId), {
        ...sanitizedChanges,
        brand: nextLitter.brand,
        weight: nextLitter.weight,
        cost: nextLitter.cost,
        customLitterTypeId: nextLitter.customLitterTypeId,
        lastEditedAt: nextLitter.lastEditedAt,
      });
      return nextLitter;
    } catch (error) {
      dispatch(revertLitter({ id: litterId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update litter.',
      );
    }
  },
);

export const deleteLitter = createAsyncThunk<
  { id: string },
  { householdId: string; litterId: string },
  { rejectValue: string }
>(
  'nineLives/litters/delete',
  async ({ householdId, litterId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litters.items.find((litter) => litter.id === litterId);

    if (!current) {
      return rejectWithValue('Litter not found.');
    }

    dispatch(removeLitter({ id: litterId }));

    try {
      await deleteDoc(getLitterDocRef(householdId, litterId));
      return { id: litterId };
    } catch (error) {
      dispatch(revertLitter({ id: litterId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete litter.',
      );
    }
  },
);
