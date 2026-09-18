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
import { cancelEntityReminders, ONE_DAY_MS, scheduleEntityReminders } from '../../utils/reminders';

// Matches the "due soon" window the dashboard already flags (see DUE_SOON_WINDOW_MS in
// utils/attentionItems.ts) plus a same-day nudge — a booster running out warrants more
// lead time than a same-week visit reminder.
const VACCINATION_REMINDER_LEAD_MS = 7 * ONE_DAY_MS;

/** Schedules a week-before and a day-of reminder for the vaccination's `expiresAt`, if it has one. */
export async function scheduleVaccinationReminders(
  state: RootState,
  householdId: string,
  uid: string,
  vaccination: Pick<Vaccination, 'id' | 'catId' | 'name' | 'expiresAt'>,
): Promise<string[]> {
  if (!vaccination.expiresAt) {
    return [];
  }

  const cat = state.nineLives.cats.items.find((item) => item.id === vaccination.catId);
  const catName = cat?.name ? `${cat.name}'s ` : '';
  const relatedEntityPath = `apps/nine-lives/households/${householdId}/vaccinations/${vaccination.id}`;

  return scheduleEntityReminders(state, householdId, uid, [
    {
      title: 'Vaccination due soon',
      body: `${catName}${vaccination.name} is due in a week.`,
      scheduledFor: vaccination.expiresAt - VACCINATION_REMINDER_LEAD_MS,
      relatedEntityPath,
    },
    {
      title: 'Vaccination due today',
      body: `${catName}${vaccination.name} is due today.`,
      scheduledFor: vaccination.expiresAt,
      relatedEntityPath,
    },
  ]);
}

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
  async ({ householdId, catId, uid, vaccination }, { dispatch, getState, rejectWithValue }) => {
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
      reminderIds: [],
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    nextVaccination.reminderIds = await scheduleVaccinationReminders(
      getState() as RootState,
      householdId,
      uid,
      nextVaccination,
    );

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
    /** Only needed to schedule a fresh reminder when `expiresAt` changes — omit it and a change still cancels the stale reminder, it just won't be replaced. */
    uid?: string;
    changes: Partial<VaccinationDose> & { name?: string };
  },
  { rejectValue: string }
>(
  'nineLives/vaccinations/update',
  async (
    { householdId, vaccinationId, uid, changes },
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

    if (nextVaccination.expiresAt !== current.expiresAt) {
      await cancelEntityReminders(current.reminderIds);
      nextVaccination.reminderIds = uid
        ? await scheduleVaccinationReminders(state, householdId, uid, nextVaccination)
        : [];
    }

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        name: nextVaccination.name,
        history: nextHistory,
        lastAdministeredAt: nextVaccination.lastAdministeredAt,
        expiresAt: nextVaccination.expiresAt,
        firstAdministeredAt: nextVaccination.firstAdministeredAt,
        reminderIds: nextVaccination.reminderIds,
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

    if (nextVaccination.expiresAt !== current.expiresAt) {
      await cancelEntityReminders(current.reminderIds);
      nextVaccination.reminderIds = await scheduleVaccinationReminders(
        state,
        householdId,
        uid,
        nextVaccination,
      );
    }

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        history: nextHistory,
        lastAdministeredAt: nextVaccination.lastAdministeredAt,
        expiresAt: nextVaccination.expiresAt,
        reminderIds: nextVaccination.reminderIds,
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
      await cancelEntityReminders(current.reminderIds);
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
  { householdId: string; vaccinationId: string; doseId: string; uid?: string },
  { rejectValue: string }
>(
  'nineLives/vaccinations/deleteDose',
  async ({ householdId, vaccinationId, doseId, uid }, { dispatch, getState, rejectWithValue }) => {
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

    if (nextVaccination.expiresAt !== current.expiresAt) {
      await cancelEntityReminders(current.reminderIds);
      nextVaccination.reminderIds = uid
        ? await scheduleVaccinationReminders(state, householdId, uid, nextVaccination)
        : [];
    }

    dispatch(upsertVaccination(nextVaccination));

    try {
      await updateDoc(getVaccinationDocRef(householdId, vaccinationId), {
        history: nextHistory,
        lastAdministeredAt: nextVaccination.lastAdministeredAt,
        expiresAt: nextVaccination.expiresAt,
        firstAdministeredAt: nextVaccination.firstAdministeredAt,
        reminderIds: nextVaccination.reminderIds,
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
