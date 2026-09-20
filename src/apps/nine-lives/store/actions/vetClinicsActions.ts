import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { VetClinic } from '@apps/nine-lives/types';

import {
  removeVetClinic,
  revertVetClinic,
  upsertVetClinic,
} from '../slices/vetClinicsSlice';

const getVetClinicDocRef = (householdId: string, vetClinicId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'vetClinics', vetClinicId);

export const createVetClinic = createAsyncThunk<
  VetClinic,
  {
    householdId: string;
    clinic: Partial<VetClinic> & Pick<VetClinic, 'name'>;
  },
  { rejectValue: string }
>(
  'nineLives/vetClinics/create',
  async ({ householdId, clinic }, { dispatch, rejectWithValue }) => {
    const trimmedName = clinic.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Clinic name is required.');
    }

    const vetClinicId =
      clinic.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'vetClinics'))
        .id;
    const now = Date.now();

    const nextClinic: VetClinic = {
      ...clinic,
      id: vetClinicId,
      householdId,
      name: trimmedName,
      phone: clinic.phone?.trim() || null,
      email: clinic.email?.trim() || null,
      website: clinic.website?.trim() || null,
      address: clinic.address?.trim() || null,
      notes: clinic.notes?.trim() || null,
      isEmergency24Hour: Boolean(clinic.isEmergency24Hour),
      createdAt: clinic.createdAt ?? now,
      lastEditedAt: now,
    };

    await setDoc(getVetClinicDocRef(householdId, vetClinicId), nextClinic);
    dispatch(upsertVetClinic(nextClinic));

    return nextClinic;
  },
);

export const updateVetClinic = createAsyncThunk<
  VetClinic,
  { householdId: string; vetClinicId: string; changes: Partial<VetClinic> },
  { rejectValue: string }
>(
  'nineLives/vetClinics/update',
  async ({ householdId, vetClinicId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.vetClinics.items.find(
      (clinic) => clinic.id === vetClinicId,
    );

    if (!current) {
      return rejectWithValue('Clinic not found.');
    }

    const optimisticClinic: VetClinic = {
      ...current,
      ...changes,
      id: vetClinicId,
      householdId,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertVetClinic(optimisticClinic));

    try {
      await updateDoc(getVetClinicDocRef(householdId, vetClinicId), changes);
      return optimisticClinic;
    } catch (error) {
      dispatch(revertVetClinic({ id: vetClinicId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update clinic.',
      );
    }
  },
);

export const deleteVetClinic = createAsyncThunk<
  { id: string },
  { householdId: string; vetClinicId: string },
  { rejectValue: string }
>(
  'nineLives/vetClinics/delete',
  async ({ householdId, vetClinicId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.vetClinics.items.find(
      (clinic) => clinic.id === vetClinicId,
    );

    if (!current) {
      return rejectWithValue('Clinic not found.');
    }

    dispatch(removeVetClinic({ id: vetClinicId }));

    try {
      await deleteDoc(getVetClinicDocRef(householdId, vetClinicId));
      return { id: vetClinicId };
    } catch (error) {
      dispatch(revertVetClinic({ id: vetClinicId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete clinic.',
      );
    }
  },
);
