import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Preventive, PreventiveDose } from '@apps/nine-lives/types';

import {
  removePreventive,
  revertPreventive,
  upsertPreventive,
} from '../slices/preventivesSlice';

export type PreventiveDoseInput = Partial<PreventiveDose> &
  Pick<PreventiveDose, 'administeredAt'>;

export type PreventiveFormSubmission = PreventiveDoseInput &
  Pick<Preventive, 'name' | 'customProductId' | 'type' | 'customTypeId' | 'catIds'> & {
    id?: string;
  };

function normalizeDoseInput(value: Partial<PreventiveDose>): Partial<PreventiveDose> {
  const next = { ...value };

  if (next.expiresAt === undefined) {
    next.expiresAt = null;
  }

  if (next.dosage === undefined) {
    next.dosage = null;
  }

  if (next.clinicId === undefined) {
    next.clinicId = null;
  }

  if (next.doctorId === undefined) {
    next.doctorId = null;
  }

  if (next.linkedVisitId === undefined) {
    next.linkedVisitId = null;
  }

  return next;
}

const getPreventiveDocRef = (householdId: string, preventiveId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'preventives', preventiveId);

const newPreventiveId = (householdId: string) =>
  doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'preventives')).id;

export const createPreventive = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    uid: string;
    preventive: PreventiveFormSubmission;
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
    const preventiveId = preventive.id ?? newPreventiveId(householdId);

    const dose: PreventiveDose = {
      id: newPreventiveId(householdId),
      administeredAt: preventive.administeredAt,
      expiresAt: preventive.expiresAt ?? null,
      dosage: preventive.dosage ?? null,
      clinicId: preventive.clinicId ?? null,
      doctorId: preventive.doctorId ?? null,
      linkedVisitId: preventive.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: now,
    };

    const nextPreventive: Preventive = {
      id: preventiveId,
      householdId,
      catIds,
      name: trimmedName,
      customProductId: preventive.customProductId,
      type: preventive.type,
      customTypeId: preventive.customTypeId,
      history: [dose],
      firstAdministeredAt: dose.administeredAt,
      lastAdministeredAt: dose.administeredAt,
      expiresAt: dose.expiresAt,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getPreventiveDocRef(householdId, preventiveId), nextPreventive);
    dispatch(upsertPreventive(nextPreventive));

    return nextPreventive;
  },
);

/** Edits the most recent dose in place (the row's "Edit" action). To add a new dose, use `logPreventiveDose`. */
export const updatePreventive = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    preventiveId: string;
    changes: Partial<PreventiveDose> &
      Partial<Pick<Preventive, 'name' | 'customProductId' | 'type' | 'customTypeId' | 'catIds'>>;
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

    const { name, customProductId, type, customTypeId, catIds, ...doseChanges } = changes;
    const sanitizedDoseChanges = normalizeDoseInput(doseChanges);

    if (catIds && catIds.length === 0) {
      return rejectWithValue('Select at least one cat.');
    }

    const latestDose = current.history[0];
    const nextDose: PreventiveDose = { ...latestDose, ...sanitizedDoseChanges };
    const nextHistory = [nextDose, ...current.history.slice(1)];
    const isOnlyDose = current.history.length === 1;

    const nextPreventive: Preventive = {
      ...current,
      id: preventiveId,
      householdId,
      name: name?.trim() || current.name,
      customProductId: customProductId !== undefined ? customProductId : current.customProductId,
      type: type ?? current.type,
      customTypeId: customTypeId !== undefined ? customTypeId : current.customTypeId,
      catIds: catIds ? [...new Set(catIds)] : current.catIds,
      history: nextHistory,
      lastAdministeredAt: nextDose.administeredAt,
      expiresAt: nextDose.expiresAt,
      firstAdministeredAt: isOnlyDose ? nextDose.administeredAt : current.firstAdministeredAt,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertPreventive(nextPreventive));

    try {
      await updateDoc(getPreventiveDocRef(householdId, preventiveId), {
        name: nextPreventive.name,
        customProductId: nextPreventive.customProductId,
        type: nextPreventive.type,
        customTypeId: nextPreventive.customTypeId,
        catIds: nextPreventive.catIds,
        history: nextHistory,
        lastAdministeredAt: nextPreventive.lastAdministeredAt,
        expiresAt: nextPreventive.expiresAt,
        firstAdministeredAt: nextPreventive.firstAdministeredAt,
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

/** Appends a new dose to the record's history (the row's "Mark administered today" action). */
export const logPreventiveDose = createAsyncThunk<
  Preventive,
  {
    householdId: string;
    preventiveId: string;
    uid: string;
    dose: PreventiveDoseInput;
  },
  { rejectValue: string }
>(
  'nineLives/preventives/logDose',
  async ({ householdId, preventiveId, uid, dose }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.preventives.items.find((item) => item.id === preventiveId);

    if (!current) {
      return rejectWithValue('Preventive not found.');
    }

    const nextDose: PreventiveDose = {
      id: newPreventiveId(householdId),
      administeredAt: dose.administeredAt,
      expiresAt: dose.expiresAt ?? null,
      dosage: dose.dosage ?? null,
      clinicId: dose.clinicId ?? null,
      doctorId: dose.doctorId ?? null,
      linkedVisitId: dose.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: Date.now(),
    };

    const nextHistory = [nextDose, ...current.history];
    const nextPreventive: Preventive = {
      ...current,
      history: nextHistory,
      lastAdministeredAt: nextDose.administeredAt,
      expiresAt: nextDose.expiresAt,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertPreventive(nextPreventive));

    try {
      await updateDoc(getPreventiveDocRef(householdId, preventiveId), {
        history: nextHistory,
        lastAdministeredAt: nextPreventive.lastAdministeredAt,
        expiresAt: nextPreventive.expiresAt,
        lastEditedAt: nextPreventive.lastEditedAt,
      });
      return nextPreventive;
    } catch (error) {
      dispatch(revertPreventive({ id: preventiveId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to log preventive dose.',
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

/**
 * Removes one dose from history. Deletes the whole record if it was the only dose left
 * (reusing `deletePreventive`), otherwise recomputes the denormalized latest/first fields.
 */
export const deletePreventiveDose = createAsyncThunk<
  { id: string; deletedRecord: boolean },
  { householdId: string; preventiveId: string; doseId: string },
  { rejectValue: string }
>(
  'nineLives/preventives/deleteDose',
  async ({ householdId, preventiveId, doseId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.preventives.items.find((item) => item.id === preventiveId);

    if (!current) {
      return rejectWithValue('Preventive not found.');
    }

    if (current.history.length <= 1) {
      const result = await dispatch(deletePreventive({ householdId, preventiveId })).unwrap();
      return { id: result.id, deletedRecord: true };
    }

    const nextHistory = current.history.filter((dose) => dose.id !== doseId);
    const latestDose = nextHistory[0];
    const oldestDose = nextHistory[nextHistory.length - 1];

    const nextPreventive: Preventive = {
      ...current,
      history: nextHistory,
      lastAdministeredAt: latestDose.administeredAt,
      expiresAt: latestDose.expiresAt,
      firstAdministeredAt: oldestDose.administeredAt,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertPreventive(nextPreventive));

    try {
      await updateDoc(getPreventiveDocRef(householdId, preventiveId), {
        history: nextHistory,
        lastAdministeredAt: nextPreventive.lastAdministeredAt,
        expiresAt: nextPreventive.expiresAt,
        firstAdministeredAt: nextPreventive.firstAdministeredAt,
        lastEditedAt: nextPreventive.lastEditedAt,
      });
      return { id: preventiveId, deletedRecord: false };
    } catch (error) {
      dispatch(revertPreventive({ id: preventiveId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete preventive dose.',
      );
    }
  },
);
