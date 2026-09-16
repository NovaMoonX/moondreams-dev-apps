import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TripSpace } from '@apps/waypoint/types';
import {
  createTripSpace,
  TRIP_COLLECTION_PATH,
  validateTripDates,
} from '@apps/waypoint/security';
import { upsertTrip } from '@apps/waypoint/store/slices/tripSlice';

interface CreateTripInput {
  uid: string;
  title: string;
  startDate: number;
  endDate: number;
}

export const createTrip = createAsyncThunk<
  TripSpace,
  CreateTripInput,
  { rejectValue: string }
>(
  'waypoint/trips/create',
  async ({ uid, title, startDate, endDate }, { dispatch, rejectWithValue }) => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return rejectWithValue('Trip title is required.');
    }

    const dateError = validateTripDates(startDate, endDate);
    if (dateError) {
      return rejectWithValue(dateError);
    }

    const tripId = doc(collection(db, ...TRIP_COLLECTION_PATH)).id;
    const trip = createTripSpace({
      id: tripId,
      title: trimmedTitle,
      startDate,
      endDate,
      createdBy: uid,
      createdAt: Date.now(),
    });

    await setDoc(doc(db, ...TRIP_COLLECTION_PATH, tripId), trip);
    dispatch(upsertTrip(trip));

    return trip;
  },
);
