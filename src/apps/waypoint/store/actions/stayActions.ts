import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Stay, TripSpace } from '@apps/waypoint/types';

type StayFields = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

interface CreateStayInput {
  uid: string;
  trip: TripSpace;
  stay: StayFields;
}

interface UpdateStayInput {
  uid: string;
  trip: TripSpace;
  stayId: string;
  stay: StayFields;
}

interface DeleteStayInput {
  uid: string;
  trip: TripSpace;
  stayId: string;
}

function canEditStays(uid: string, trip: TripSpace) {
  return ['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '');
}

export const createStay = createAsyncThunk<
  Stay,
  CreateStayInput,
  { rejectValue: string }
>('waypoint/stays/create', async ({ uid, trip, stay }, { rejectWithValue }) => {
  if (!canEditStays(uid, trip)) {
    return rejectWithValue('You do not have permission to add stays.');
  }
  if (!stay.name.trim() || !stay.address.trim()) {
    return rejectWithValue('Stay name and address are required.');
  }
  if (
    !Number.isFinite(stay.checkInAt) ||
    !Number.isFinite(stay.checkOutAt) ||
    stay.checkOutAt <= stay.checkInAt
  ) {
    return rejectWithValue('Choose valid check-in and check-out times.');
  }

  const stayRef = doc(collection(db, 'apps', 'waypoint', 'trips', trip.id, 'stays'));
  const now = Date.now();
  const createdStay: Stay = {
    ...stay,
    id: stayRef.id,
    tripId: trip.id,
    name: stay.name.trim(),
    address: stay.address.trim(),
    checkInTimezone: stay.checkInTimezone?.trim() || null,
    plannedArrivalAt: stay.plannedArrivalAt,
    plannedDepartureAt: stay.plannedDepartureAt,
    confirmationCode: stay.confirmationCode?.trim() || null,
    notes: stay.notes?.trim() || null,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };

  await setDoc(stayRef, createdStay);
  return createdStay;
});

function validateStay(stay: StayFields) {
  if (!stay.name.trim() || !stay.address.trim()) {
    return 'Stay name and address are required.';
  }
  if (
    !Number.isFinite(stay.checkInAt) ||
    !Number.isFinite(stay.checkOutAt) ||
    !Number.isFinite(stay.plannedArrivalAt) ||
    !Number.isFinite(stay.plannedDepartureAt) ||
    stay.checkOutAt <= stay.checkInAt ||
    stay.plannedDepartureAt <= stay.plannedArrivalAt
  ) {
    return 'Choose valid stay times.';
  }
  return null;
}

export const updateStay = createAsyncThunk<
  StayFields,
  UpdateStayInput,
  { rejectValue: string }
>('waypoint/stays/update', async ({ uid, trip, stayId, stay }, { rejectWithValue }) => {
  if (!canEditStays(uid, trip)) {
    return rejectWithValue('You do not have permission to edit stays.');
  }
  const validationError = validateStay(stay);
  if (validationError) {
    return rejectWithValue(validationError);
  }

  const stayRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'stays', stayId);
  const currentStay = {
    ...stay,
    id: stayId,
    tripId: trip.id,
    name: stay.name.trim(),
    address: stay.address.trim(),
    checkInTimezone: stay.checkInTimezone?.trim() || null,
    confirmationCode: stay.confirmationCode?.trim() || null,
    notes: stay.notes?.trim() || null,
  };
  await setDoc(stayRef, { ...currentStay, lastEditedAt: Date.now() }, { merge: true });
  return stay;
});

export const deleteStay = createAsyncThunk<
  string,
  DeleteStayInput,
  { rejectValue: string }
>('waypoint/stays/delete', async ({ uid, trip, stayId }, { rejectWithValue }) => {
  if (!canEditStays(uid, trip)) {
    return rejectWithValue('You do not have permission to delete stays.');
  }
  await deleteDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'stays', stayId));
  return stayId;
});
