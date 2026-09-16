import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getUniqueInviteCode } from '@/lib/firebase/firestore';
import type { TripSpace } from '@apps/waypoint/types';
import {
  createTripSpace,
  TRIP_COLLECTION_PATH,
  validateTripDates,
} from '@apps/waypoint/security';
import { upsertTrip } from '@apps/waypoint/store/slices/tripSlice';

export const WAYPOINT_CODE_LENGTH = 6;
const INVITE_CODE_COLLECTION = collection(db, 'apps', 'waypoint', 'inviteCodes');

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
    const inviteCode = await getUniqueInviteCode(INVITE_CODE_COLLECTION, {
      length: WAYPOINT_CODE_LENGTH,
    });
    const trip = createTripSpace({
      id: tripId,
      title: trimmedTitle,
      startDate,
      endDate,
      createdBy: uid,
      createdAt: Date.now(),
      inviteCode,
    });

    const batch = writeBatch(db);
    batch.set(doc(db, ...TRIP_COLLECTION_PATH, tripId), trip);
    batch.set(doc(INVITE_CODE_COLLECTION, inviteCode), { tripId });
    await batch.commit();
    dispatch(upsertTrip(trip));

    return trip;
  },
);
