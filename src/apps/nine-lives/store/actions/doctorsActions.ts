import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Doctor } from '@apps/nine-lives/types';

import { removeDoctor, revertDoctor, upsertDoctor } from '../slices/doctorsSlice';

const getDoctorDocRef = (householdId: string, doctorId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'doctors', doctorId);

export const createDoctor = createAsyncThunk<
  Doctor,
  {
    householdId: string;
    clinicId: string;
    name: string;
    notes?: string | null;
  },
  { rejectValue: string }
>(
  'nineLives/doctors/create',
  async ({ householdId, clinicId, name, notes }, { dispatch, getState, rejectWithValue }) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return rejectWithValue('Doctor name is required.');
    }

    const state = getState() as RootState;
    const existing = state.nineLives.doctors.items.find(
      (doctor) =>
        doctor.householdId === householdId &&
        doctor.clinicId === clinicId &&
        doctor.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const doctorId =
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'doctors')).id;
    const now = Date.now();

    const nextDoctor: Doctor = {
      id: doctorId,
      householdId,
      clinicId,
      name: trimmedName,
      notes: notes?.trim() || null,
      createdAt: now,
    };

    await setDoc(getDoctorDocRef(householdId, doctorId), nextDoctor);
    dispatch(upsertDoctor(nextDoctor));

    return nextDoctor;
  },
);

export const updateDoctor = createAsyncThunk<
  Doctor,
  { householdId: string; doctorId: string; changes: Partial<Doctor> },
  { rejectValue: string }
>(
  'nineLives/doctors/update',
  async ({ householdId, doctorId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.doctors.items.find((doctor) => doctor.id === doctorId);

    if (!current) {
      return rejectWithValue('Doctor not found.');
    }

    const optimisticDoctor: Doctor = {
      ...current,
      ...changes,
      id: doctorId,
      householdId,
    };

    dispatch(upsertDoctor(optimisticDoctor));

    try {
      await updateDoc(getDoctorDocRef(householdId, doctorId), changes);
      return optimisticDoctor;
    } catch (error) {
      dispatch(revertDoctor({ id: doctorId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update doctor.',
      );
    }
  },
);

export const deleteDoctor = createAsyncThunk<
  { id: string },
  { householdId: string; doctorId: string },
  { rejectValue: string }
>(
  'nineLives/doctors/delete',
  async ({ householdId, doctorId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.doctors.items.find((doctor) => doctor.id === doctorId);

    if (!current) {
      return rejectWithValue('Doctor not found.');
    }

    dispatch(removeDoctor({ id: doctorId }));

    try {
      await deleteDoc(getDoctorDocRef(householdId, doctorId));
      return { id: doctorId };
    } catch (error) {
      dispatch(revertDoctor({ id: doctorId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete doctor.',
      );
    }
  },
);
