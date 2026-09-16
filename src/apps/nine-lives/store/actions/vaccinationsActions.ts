import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Vaccination, VaccinationDose } from '@apps/nine-lives/types';

import {
  removeVaccination,
  revertVaccination,
  upsertVaccination,
} from '../slices/vaccinationsSlice';

export type VaccinationDoseInput = Partial<VaccinationDose> &
  Pick<VaccinationDose, 'administeredAt'>;

export type VaccinationFormSubmission = VaccinationDoseInput & {
  id?: string;
  catId?: string;
  name: string;
};

function normalizeDoseInput(value: Partial<VaccinationDose>): Partial<VaccinationDose> {
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

const newVaccinationId = (householdId: string) =>
  doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'vaccinations')).id;

export const createVaccination = createAsyncThunk<
  Vaccination,
  {
    householdId: string;
    catId: string;
    uid: string;
    vaccination: VaccinationFormSubmission;
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
    const vaccinationId = vaccination.id ?? newVaccinationId(householdId);

    const dose: VaccinationDose = {
      id: newVaccinationId(householdId),
      administeredAt: vaccination.administeredAt,
      expiresAt: vaccination.expiresAt ?? null,
      clinicId: vaccination.clinicId ?? null,
      doctorId: vaccination.doctorId ?? null,
      lotNumber: vaccination.lotNumber ?? null,
      linkedVisitId: vaccination.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: now,
    };

    const nextVaccination: Vaccination = {
      id: vaccinationId,
      householdId,
      catId,
      name: trimmedName,
      history: [dose],
      firstAdministeredAt: dose.administeredAt,
      lastAdministeredAt: dose.administeredAt,
      expiresAt: dose.expiresAt,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getVaccinationDocRef(householdId, vaccinationId), nextVaccination);
    dispatch(upsertVaccination(nextVaccination));

    return nextVaccination;
  },
);

/** Edits the most recent dose in place (the row's "Edit" action). To add a new dose, use `logVaccinationDose`. */
export const updateVaccination = createAsyncThunk<
  Vaccination,
  {
    householdId: string;
    vaccinationId: string;
    changes: Partial<VaccinationDose> & { name?: string };
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

    const { name, ...doseChanges } = changes;
    const sanitizedDoseChanges = normalizeDoseInput(doseChanges);
    const latestDose = current.history[0];
    const nextDose: VaccinationDose = { ...latestDose, ...sanitizedDoseChanges };
    const nextHistory = [nextDose, ...current.history.slice(1)];
    const isOnlyDose = current.history.length === 1;

    const nextVaccination: Vaccination = {
      ...current,
      id: vaccinationId,
      householdId,
      name: name?.trim() || current.name,
      history: nextHistory,
      lastAdministeredAt: nextDose.administeredAt,
      expiresAt: nextDose.expiresAt,
      firstAdministeredAt: isOnlyDose ? nextDose.administeredAt : current.firstAdministeredAt,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        name: nextVaccination.name,
        history: nextHistory,
        lastAdministeredAt: nextVaccination.lastAdministeredAt,
        expiresAt: nextVaccination.expiresAt,
        firstAdministeredAt: nextVaccination.firstAdministeredAt,
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

/** Appends a new dose to the record's history (the row's "Mark administered today" action). */
export const logVaccinationDose = createAsyncThunk<
  Vaccination,
  {
    householdId: string;
    vaccinationId: string;
    uid: string;
    dose: VaccinationDoseInput;
  },
  { rejectValue: string }
>(
  'nineLives/vaccinations/logDose',
  async ({ householdId, vaccinationId, uid, dose }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.vaccinations.items.find((item) => item.id === vaccinationId);

    if (!current) {
      return rejectWithValue('Vaccination not found.');
    }

    const nextDose: VaccinationDose = {
      id: newVaccinationId(householdId),
      administeredAt: dose.administeredAt,
      expiresAt: dose.expiresAt ?? null,
      clinicId: dose.clinicId ?? null,
      doctorId: dose.doctorId ?? null,
      lotNumber: dose.lotNumber ?? null,
      linkedVisitId: dose.linkedVisitId ?? null,
      createdBy: uid,
      createdAt: Date.now(),
    };

    const nextHistory = [nextDose, ...current.history];
    const nextVaccination: Vaccination = {
      ...current,
      history: nextHistory,
      lastAdministeredAt: nextDose.administeredAt,
      expiresAt: nextDose.expiresAt,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        history: nextHistory,
        lastAdministeredAt: nextVaccination.lastAdministeredAt,
        expiresAt: nextVaccination.expiresAt,
        lastEditedAt: nextVaccination.lastEditedAt,
      });
      return nextVaccination;
    } catch (error) {
      dispatch(revertVaccination({ id: vaccinationId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to log vaccination dose.',
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

/**
 * Removes one dose from history. Deletes the whole record if it was the only dose left
 * (reusing `deleteVaccination`), otherwise recomputes the denormalized latest/first fields.
 */
export const deleteVaccinationDose = createAsyncThunk<
  { id: string; deletedRecord: boolean },
  { householdId: string; vaccinationId: string; doseId: string },
  { rejectValue: string }
>(
  'nineLives/vaccinations/deleteDose',
  async ({ householdId, vaccinationId, doseId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.vaccinations.items.find((item) => item.id === vaccinationId);

    if (!current) {
      return rejectWithValue('Vaccination not found.');
    }

    if (current.history.length <= 1) {
      const result = await dispatch(deleteVaccination({ householdId, vaccinationId })).unwrap();
      return { id: result.id, deletedRecord: true };
    }

    const nextHistory = current.history.filter((dose) => dose.id !== doseId);
    const latestDose = nextHistory[0];
    const oldestDose = nextHistory[nextHistory.length - 1];

    const nextVaccination: Vaccination = {
      ...current,
      history: nextHistory,
      lastAdministeredAt: latestDose.administeredAt,
      expiresAt: latestDose.expiresAt,
      firstAdministeredAt: oldestDose.administeredAt,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        history: nextHistory,
        lastAdministeredAt: nextVaccination.lastAdministeredAt,
        expiresAt: nextVaccination.expiresAt,
        firstAdministeredAt: nextVaccination.firstAdministeredAt,
        lastEditedAt: nextVaccination.lastEditedAt,
      });
      return { id: vaccinationId, deletedRecord: false };
    } catch (error) {
      dispatch(revertVaccination({ id: vaccinationId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete vaccination dose.',
      );
    }
  },
);
