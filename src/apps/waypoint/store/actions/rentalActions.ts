import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Rental, TripSpace } from '@apps/waypoint/types';
import { compareDayTime } from '@/utils/dayTimeUtils';
import { canCreateItem, canEditExistingItem } from '@apps/waypoint/utils/roleGuards';

export type RentalFields = Omit<Rental, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

interface CreateRentalInput {
  uid: string;
  trip: TripSpace;
  rental: RentalFields;
}

interface UpdateRentalInput {
  uid: string;
  trip: TripSpace;
  rentalId: string;
  rental: RentalFields;
}

interface UpdateRentalNotesInput {
  uid: string;
  trip: TripSpace;
  rental: Rental;
  notes: string;
}

interface DeleteRentalInput {
  uid: string;
  trip: TripSpace;
  rentalId: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateRental(rental: RentalFields) {
  if (!rental.name.trim() || !rental.pickupAddress.trim()) {
    return 'Rental company and pickup location are required.';
  }

  const isValidTime =
    Number.isInteger(rental.pickupDayIndex) &&
    Number.isInteger(rental.returnDayIndex) &&
    TIME_PATTERN.test(rental.pickupTime) &&
    TIME_PATTERN.test(rental.returnTime) &&
    compareDayTime(
      { day: rental.returnDayIndex, time: rental.returnTime },
      { day: rental.pickupDayIndex, time: rental.pickupTime },
    ) > 0;
  return isValidTime ? null : 'Choose a return time after the pickup.';
}

function normalizeRental(rental: RentalFields): RentalFields {
  const returnAddress = rental.returnAddress?.trim() || null;
  const linkUrl = rental.linkUrl?.trim() || null;
  return {
    ...rental,
    name: rental.name.trim(),
    vehicle: rental.vehicle?.trim() || null,
    pickupAddress: rental.pickupAddress.trim(),
    returnAddress,
    returnLatitude: returnAddress ? rental.returnLatitude : null,
    returnLongitude: returnAddress ? rental.returnLongitude : null,
    returnPlace: returnAddress ? rental.returnPlace : null,
    timezone: rental.timezone?.trim() || null,
    confirmationCode: rental.confirmationCode?.trim() || null,
    notes: rental.notes?.trim() || null,
    linkUrl,
    linkPreview: linkUrl ? rental.linkPreview : null,
  };
}

export const createRental = createAsyncThunk<
  Rental,
  CreateRentalInput,
  { rejectValue: string }
>('waypoint/rentals/create', async ({ uid, trip, rental }, { rejectWithValue }) => {
  if (!canCreateItem(trip, uid)) {
    return rejectWithValue('You do not have permission to add rentals.');
  }
  const validationError = validateRental(rental);
  if (validationError) {
    return rejectWithValue(validationError);
  }

  const rentalRef = doc(collection(db, 'apps', 'waypoint', 'trips', trip.id, 'rentals'));
  const now = Date.now();
  const createdRental: Rental = {
    ...normalizeRental(rental),
    id: rentalRef.id,
    tripId: trip.id,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };

  await setDoc(rentalRef, createdRental);
  return createdRental;
});

export const updateRental = createAsyncThunk<
  RentalFields,
  UpdateRentalInput,
  { rejectValue: string }
>('waypoint/rentals/update', async ({ uid, trip, rentalId, rental }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit rentals.');
  }
  const validationError = validateRental(rental);
  if (validationError) {
    return rejectWithValue(validationError);
  }

  const normalized = normalizeRental(rental);
  await updateDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'rentals', rentalId), {
    ...normalized,
    id: rentalId,
    tripId: trip.id,
    lastEditedAt: Date.now(),
  });
  return normalized;
});

export const updateRentalNotes = createAsyncThunk<
  void,
  UpdateRentalNotesInput,
  { rejectValue: string }
>('waypoint/rentals/updateNotes', async ({ uid, trip, rental, notes }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit this rental.');
  }

  await updateDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'rentals', rental.id), {
    notes: notes.trim() || null,
    lastEditedAt: Date.now(),
  });
});

export const deleteRental = createAsyncThunk<
  string,
  DeleteRentalInput,
  { rejectValue: string }
>('waypoint/rentals/delete', async ({ uid, trip, rentalId }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to delete rentals.');
  }
  await deleteDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'rentals', rentalId));
  return rentalId;
});
