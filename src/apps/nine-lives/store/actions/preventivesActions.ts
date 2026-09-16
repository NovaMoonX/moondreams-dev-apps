import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Preventive } from '@apps/nine-lives/types';

import {
  removePreventive,
  revertPreventive,
  upsertPreventive,
} from '../slices/preventivesSlice';

function normalizePreventiveInput(value: Partial<Preventive>): Partial<Preventive> {
  const next = { ...value };

  if (next.catIds) {
    next.catIds = [...new Set(next.catIds)];
  }

  if (next.customProductId === undefined) next.customProductId = null;
  if (next.customTypeId === undefined) next.customTypeId = null;
  if (next.expiresAt === undefined) next.expiresAt = null;
  if (next.dosage === undefined) next.dosage = null;
  if (next.clinicId === undefined) next.clinicId = null;
  if (next.doctorId === undefined) next.doctorId = null;
  if (next.linkedVisitId === undefined) next.linkedVisitId = null;

  return next;
}

const getPreventiveDocRef = (householdId: string, preventiveId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'preventives', preventiveId);

export const createPreventive = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    uid: string;
    preventive: Partial<Preventive> &
      Pick<Preventive, 'name' | 'customProductId' | 'type' | 'customTypeId' | 'administeredAt' | 'catIds'>;
  },
  { rejectValue: string }
>(
  'nineLives/preventives/create',
  async ({ householdId, uid, preventive }, { dispatch, rejectWithValue }) => {
    const trimmedName = preventive.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Preventive name is required.');
    }

    const catIds = [...new Set(preventive.catIds)];

    if (catIds.length === 0) {
      return rejectWithValue('Select at least one cat.');
    }

    const now = Date.now();
    const preventiveId =
      preventive.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'preventives')).id;

    const nextPreventive: Preventive = {
      id: preventiveId,
      householdId,
      catIds,
      name: trimmedName,
      customProductId: preventive.customProductId,
      type: preventive.type,
      customTypeId: preventive.customTypeId,
      administeredAt: preventive.administeredAt,
      expiresAt: preventive.expiresAt ?? null,
      dosage: preventive.dosage ?? null,
      clinicId: preventive.clinicId ?? null,
      doctorId: preventive.doctorId ?? null,
      linkedVisitId: preventive.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getPreventiveDocRef(householdId, preventiveId), nextPreventive);
    dispatch(upsertPreventive(nextPreventive));

    return nextPreventive;
  },
);

export const updatePreventive = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    preventiveId: string;
    changes: Partial<Preventive>;
  },
  { rejectValue: string }
>(
  'nineLives/preventives/update',
  async (
    { householdId, preventiveId, changes },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.preventives.items.find((item) => item.id === preventiveId);

    if (!current) {
      return rejectWithValue('Preventive not found.');
    }

    const sanitizedChanges = normalizePreventiveInput(changes);

    if (sanitizedChanges.catIds && sanitizedChanges.catIds.length === 0) {
      return rejectWithValue('Select at least one cat.');
    }

    const nextPreventive: Preventive = {
      ...current,
      ...sanitizedChanges,
      id: preventiveId,
      householdId,
      name: sanitizedChanges.name?.trim() || current.name,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertPreventive(nextPreventive));

    try {
      await updateDoc(getPreventiveDocRef(householdId, preventiveId), {
        ...sanitizedChanges,
        lastEditedAt: nextPreventive.lastEditedAt,
      });
      return nextPreventive;
    } catch (error) {
      dispatch(revertPreventive({ id: preventiveId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update preventive.',
      );
    }
  },
);

export const deletePreventive = createAsyncThunk<
  { id: string },
  { householdId: string; preventiveId: string },
  { rejectValue: string }
>(
  'nineLives/preventives/delete',
  async ({ householdId, preventiveId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.preventives.items.find((item) => item.id === preventiveId);

    if (!current) {
      return rejectWithValue('Preventive not found.');
    }

    dispatch(removePreventive({ id: preventiveId }));

    try {
      await deleteDoc(getPreventiveDocRef(householdId, preventiveId));
      return { id: preventiveId };
    } catch (error) {
      dispatch(revertPreventive({ id: preventiveId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete preventive.',
      );
    }
  },
);
