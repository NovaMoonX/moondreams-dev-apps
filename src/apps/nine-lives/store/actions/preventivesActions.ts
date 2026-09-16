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

  if (next.expiresAt === undefined) next.expiresAt = null;
  if (next.dosage === undefined) next.dosage = null;
  if (next.clinicId === undefined) next.clinicId = null;
  if (next.doctorId === undefined) next.doctorId = null;
  if (next.linkedVisitId === undefined) next.linkedVisitId = null;

  return next;
}

const getPreventiveDocRef = (
  householdId: string,
  catId: string,
  preventiveId: string,
) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'preventives',
    preventiveId,
  );

export const createPreventive = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    catId: string;
    uid: string;
    preventive: Partial<Preventive> & Pick<Preventive, 'name' | 'type' | 'administeredAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/preventives/create',
  async ({ householdId, catId, uid, preventive }, { dispatch, rejectWithValue }) => {
    const trimmedName = preventive.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Preventive name is required.');
    }

    const now = Date.now();
    const preventiveId =
      preventive.id ??
      doc(
        collection(
          db,
          'apps',
          'nine-lives',
          'households',
          householdId,
          'cats',
          catId,
          'preventives',
        ),
      ).id;

    const nextPreventive: Preventive = {
      id: preventiveId,
      householdId,
      catId,
      name: trimmedName,
      type: preventive.type,
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

    await setDoc(getPreventiveDocRef(householdId, catId, preventiveId), nextPreventive);
    dispatch(upsertPreventive(nextPreventive));

    return nextPreventive;
  },
);

export const updatePreventive = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    catId: string;
    preventiveId: string;
    changes: Partial<Preventive>;
  },
  { rejectValue: string }
>(
  'nineLives/preventives/update',
  async (
    { householdId, catId, preventiveId, changes },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.preventives.items.find(
      (item) => item.id === preventiveId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Preventive not found.');
    }

    const sanitizedChanges = normalizePreventiveInput(changes);
    const nextPreventive: Preventive = {
      ...current,
      ...sanitizedChanges,
      id: preventiveId,
      householdId,
      catId,
      name: sanitizedChanges.name?.trim() || current.name,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertPreventive(nextPreventive));

    try {
      await updateDoc(getPreventiveDocRef(householdId, catId, preventiveId), {
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
  { householdId: string; catId: string; preventiveId: string },
  { rejectValue: string }
>(
  'nineLives/preventives/delete',
  async ({ householdId, catId, preventiveId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.preventives.items.find(
      (item) => item.id === preventiveId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Preventive not found.');
    }

    dispatch(removePreventive({ id: preventiveId }));

    try {
      await deleteDoc(getPreventiveDocRef(householdId, catId, preventiveId));
      return { id: preventiveId };
    } catch (error) {
      dispatch(revertPreventive({ id: preventiveId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete preventive.',
      );
    }
  },
);
