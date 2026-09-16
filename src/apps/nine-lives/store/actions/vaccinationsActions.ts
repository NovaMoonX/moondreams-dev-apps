import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Vaccination } from '@apps/nine-lives/types';

import {
  removeVaccination,
  revertVaccination,
  upsertVaccination,
} from '../slices/vaccinationsSlice';

function normalizeVaccinationInput(
  value: Partial<Vaccination>,
): Partial<Vaccination> {
  const next = { ...value };

  if (next.expiresAt === undefined) {
    next.expiresAt = null;
  }

  if (next.clinicId === undefined) {
    next.clinicId = null;
  }

  if (next.doctorId === undefined) {
    next.doctorId = null;
  }

  if (next.lotNumber === undefined) {
    next.lotNumber = null;
  }

  if (next.linkedVisitId === undefined) {
    next.linkedVisitId = null;
  }

  return next;
}

const getVaccinationDocRef = (householdId: string, vaccinationId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'vaccinations', vaccinationId);

export const createVaccination = createAsyncThunk<
  Vaccination,
  {
    householdId: string;
    catId: string;
    uid: string;
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/vaccinations/create',
  async ({ householdId, catId, uid, vaccination }, { dispatch, rejectWithValue }) => {
    const trimmedName = vaccination.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Vaccination name is required.');
    }

    const now = Date.now();
    const vaccinationId =
      vaccination.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'vaccinations')).id;

    const nextVaccination: Vaccination = {
      id: vaccinationId,
      householdId,
      catId,
      name: trimmedName,
      administeredAt: vaccination.administeredAt,
      expiresAt: vaccination.expiresAt ?? null,
      clinicId: vaccination.clinicId ?? null,
      doctorId: vaccination.doctorId ?? null,
      lotNumber: vaccination.lotNumber ?? null,
      linkedVisitId: vaccination.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getVaccinationDocRef(householdId, vaccinationId), nextVaccination);
    dispatch(upsertVaccination(nextVaccination));

    return nextVaccination;
  },
);

export const updateVaccination = createAsyncThunk<
  Vaccination,
  {
    householdId: string;
    vaccinationId: string;
    changes: Partial<Vaccination>;
  },
  { rejectValue: string }
>(
  'nineLives/vaccinations/update',
  async (
    { householdId, vaccinationId, changes },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.vaccinations.items.find((item) => item.id === vaccinationId);

    if (!current) {
      return rejectWithValue('Vaccination not found.');
    }

    const sanitizedChanges = normalizeVaccinationInput(changes);
    const nextVaccination: Vaccination = {
      ...current,
      ...sanitizedChanges,
      id: vaccinationId,
      householdId,
      name: sanitizedChanges.name?.trim() || current.name,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        ...sanitizedChanges,
        lastEditedAt: nextVaccination.lastEditedAt,
      });
      return nextVaccination;
    } catch (error) {
      dispatch(revertVaccination({ id: vaccinationId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update vaccination.',
      );
    }
  },
);

export const deleteVaccination = createAsyncThunk<
  { id: string },
  { householdId: string; vaccinationId: string },
  { rejectValue: string }
>(
  'nineLives/vaccinations/delete',
  async ({ householdId, vaccinationId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.vaccinations.items.find((item) => item.id === vaccinationId);

    if (!current) {
      return rejectWithValue('Vaccination not found.');
    }

    dispatch(removeVaccination({ id: vaccinationId }));

    try {
      await deleteDoc(getVaccinationDocRef(householdId, vaccinationId));
      return { id: vaccinationId };
    } catch (error) {
      dispatch(revertVaccination({ id: vaccinationId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete vaccination.',
      );
    }
  },
);
