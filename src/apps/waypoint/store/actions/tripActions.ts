import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';

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
const INVITE_CODE_COLLECTION = collection(
  db,
  'apps',
  'waypoint',
  'inviteCodes',
);

interface CreateTripInput {
  uid: string;
  title: string;
  startDate: number;
  endDate: number;
}

export interface EditTripValues {
  title: string;
  startDate: number;
  endDate: number;
  coverImageUrl: string | null;
  defaultCurrency: string | null;
}

interface EditTripInput {
  uid: string;
  trip: TripSpace;
  values: EditTripValues;
}

interface SetTripArchivedInput {
  uid: string;
  trip: TripSpace;
  isArchived: boolean;
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
    batch.set(doc(INVITE_CODE_COLLECTION, inviteCode), {
      tripId,
      title: trip.title,
    });
    await batch.commit();
    dispatch(upsertTrip(trip));

    return trip;
  },
);

function getShiftedTimestamp(value: unknown, delta: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value + delta
    : null;
}

export const editTrip = createAsyncThunk<
  TripSpace,
  EditTripInput,
  { rejectValue: string }
>(
  'waypoint/trips/edit',
  async ({ uid, trip, values }, { dispatch, rejectWithValue }) => {
    const title = values.title.trim();
    const coverImageUrl = values.coverImageUrl?.trim() || null;
    const defaultCurrency =
      values.defaultCurrency?.trim().toUpperCase() || null;

    if (!title) {
      return rejectWithValue('Trip title is required.');
    }

    const dateError = validateTripDates(values.startDate, values.endDate);
    if (dateError) {
      return rejectWithValue(dateError);
    }

    if (
      !trip.members[uid] ||
      !['ADMIN', 'EDITOR'].includes(trip.members[uid].role)
    ) {
      return rejectWithValue('You do not have permission to edit this trip.');
    }

    const dateDelta = values.startDate - trip.startDate;
    const tripRef = doc(db, ...TRIP_COLLECTION_PATH, trip.id);
    const batch = writeBatch(db);
    const lastEditedAt = Date.now();

    if (dateDelta !== 0) {
      const [eventsSnapshot, staysSnapshot] = await Promise.all([
        getDocs(collection(tripRef, 'events')),
        getDocs(collection(tripRef, 'stays')),
      ]);

      eventsSnapshot.docs.forEach((eventSnapshot) => {
        const data = eventSnapshot.data();
        const updates: Record<string, number> = {};
        const shiftedStartAt = getShiftedTimestamp(data.startAt, dateDelta);
        const shiftedEndAt = getShiftedTimestamp(data.endAt, dateDelta);

        if (shiftedStartAt !== null) {
          updates.startAt = shiftedStartAt;
        }
        if (shiftedEndAt !== null) {
          updates.endAt = shiftedEndAt;
        }
        if (Object.keys(updates).length > 0) {
          batch.update(eventSnapshot.ref, updates);
        }
      });

      staysSnapshot.docs.forEach((staySnapshot) => {
        const data = staySnapshot.data();
        const updates: Record<string, number> = {};

        for (const field of [
          'checkInAt',
          'checkOutAt',
          'plannedArrivalAt',
          'plannedDepartureAt',
        ]) {
          const shiftedValue = getShiftedTimestamp(data[field], dateDelta);
          if (shiftedValue !== null) {
            updates[field] = shiftedValue;
          }
        }

        if (Object.keys(updates).length > 0) {
          batch.update(staySnapshot.ref, updates);
        }
      });
    }

    batch.update(tripRef, {
      title,
      startDate: values.startDate,
      endDate: values.endDate,
      coverImageUrl,
      defaultCurrency,
      lastEditedAt,
    });
    await batch.commit();

    const updatedTrip: TripSpace = {
      ...trip,
      title,
      startDate: values.startDate,
      endDate: values.endDate,
      coverImageUrl,
      defaultCurrency,
      lastEditedAt,
    };
    dispatch(upsertTrip(updatedTrip));
    return updatedTrip;
  },
);

export const setTripArchived = createAsyncThunk<
  TripSpace,
  SetTripArchivedInput,
  { rejectValue: string }
>(
  'waypoint/trips/setArchived',
  async ({ uid, trip, isArchived }, { dispatch, rejectWithValue }) => {
    if (trip.members[uid]?.role !== 'ADMIN') {
      return rejectWithValue('Only trip admins can archive trips.');
    }

    const updatedTrip: TripSpace = {
      ...trip,
      isArchived,
      lastEditedAt: Date.now(),
    };
    const batch = writeBatch(db);
    batch.update(doc(db, ...TRIP_COLLECTION_PATH, trip.id), {
      isArchived,
      lastEditedAt: updatedTrip.lastEditedAt,
    });
    await batch.commit();
    dispatch(upsertTrip(updatedTrip));
    return updatedTrip;
  },
);
