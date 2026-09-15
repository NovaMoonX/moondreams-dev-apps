import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { CatCondition } from '@apps/nine-lives/types';

import {
  removeCatCondition,
  revertCatCondition,
  upsertCatCondition,
} from '../slices/catConditionsSlice';

function normalizeCatConditionInput(
  value: Partial<CatCondition>,
): Partial<CatCondition> {
  const next = { ...value };

  if (next.libraryConditionId === undefined) {
    next.libraryConditionId = null;
  }

  if (next.resolvedAt === undefined) {
    next.resolvedAt = null;
  }

  if (next.description === undefined) {
    next.description = null;
  }

  if (next.linkedVisitIds === undefined) {
    next.linkedVisitIds = [];
  }

  return next;
}

const getCatConditionDocRef = (
  householdId: string,
  catId: string,
  catConditionId: string,
) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'conditions',
    catConditionId,
  );

export const createCatCondition = createAsyncThunk<
  CatCondition,
  {
    householdId: string;
    catId: string;
    uid: string;
    condition: Partial<CatCondition> &
      Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/catConditions/create',
  async ({ householdId, catId, uid, condition }, { dispatch, rejectWithValue }) => {
    const trimmedName = condition.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Condition name is required.');
    }

    const now = Date.now();
    const catConditionId =
      condition.id ??
      doc(
        collection(db, 'apps', 'nine-lives', 'households', householdId, 'cats', catId, 'conditions'),
      ).id;

    const nextCondition: CatCondition = {
      id: catConditionId,
      catId,
      source: condition.source ?? 'custom',
      libraryConditionId: condition.libraryConditionId ?? null,
      name: trimmedName,
      category: condition.category,
      status: condition.status,
      occurredAt: condition.occurredAt,
      resolvedAt: condition.resolvedAt ?? null,
      description: condition.description ?? null,
      linkedVisitIds: condition.linkedVisitIds ?? [],
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getCatConditionDocRef(householdId, catId, catConditionId), nextCondition);
    dispatch(upsertCatCondition(nextCondition));

    return nextCondition;
  },
);

export const updateCatCondition = createAsyncThunk<
  CatCondition,
  {
    householdId: string;
    catId: string;
    catConditionId: string;
    changes: Partial<CatCondition>;
  },
  { rejectValue: string }
>(
  'nineLives/catConditions/update',
  async (
    { householdId, catId, catConditionId, changes },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.catConditions.items.find(
      (item) => item.id === catConditionId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Condition not found.');
    }

    const sanitizedChanges = normalizeCatConditionInput(changes);
    const nextCondition: CatCondition = {
      ...current,
      ...sanitizedChanges,
      id: catConditionId,
      catId,
      name: sanitizedChanges.name?.trim() || current.name,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertCatCondition(nextCondition));

    try {
      await updateDoc(getCatConditionDocRef(householdId, catId, catConditionId), {
        ...sanitizedChanges,
        lastEditedAt: nextCondition.lastEditedAt,
      });
      return nextCondition;
    } catch (error) {
      dispatch(revertCatCondition({ id: catConditionId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update condition.',
      );
    }
  },
);

export const deleteCatCondition = createAsyncThunk<
  { id: string },
  { householdId: string; catId: string; catConditionId: string },
  { rejectValue: string }
>(
  'nineLives/catConditions/delete',
  async ({ householdId, catId, catConditionId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.catConditions.items.find(
      (item) => item.id === catConditionId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Condition not found.');
    }

    dispatch(removeCatCondition({ id: catConditionId }));

    try {
      await deleteDoc(getCatConditionDocRef(householdId, catId, catConditionId));
      return { id: catConditionId };
    } catch (error) {
      dispatch(revertCatCondition({ id: catConditionId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete condition.',
      );
    }
  },
);
