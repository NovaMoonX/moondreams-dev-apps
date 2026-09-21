import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  doc,
  type DocumentReference,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getUniqueInviteCode } from '@/lib/firebase/firestore';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { TripSpace } from '@apps/waypoint/types';
import {
  createTripSpace,
  TRIP_COLLECTION_PATH,
  validateTripDates,
} from '@apps/waypoint/security';
import { upsertTrip } from '@apps/waypoint/store/slices/tripSlice';

export const WAYPOINT_CODE_LENGTH = 6;
export const getTripCoverStoragePath = (tripId: string) =>
  `waypoint/trips/${tripId}/cover/cover`;
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
  coverImageFile: File | null;
}

export interface EditTripValues {
  title: string;
  startDate: number;
  endDate: number;
  coverImageUrl: string | null;
  coverImageFile: File | null;
  coverImageRemoved: boolean;
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
  async (
    { uid, title, startDate, endDate, coverImageFile },
    { dispatch, rejectWithValue },
  ) => {
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
    const tripRef = doc(db, ...TRIP_COLLECTION_PATH, tripId);
    const lastEditedAt = Date.now();

    const batch = writeBatch(db);
    batch.set(tripRef, trip);
    batch.set(doc(INVITE_CODE_COLLECTION, inviteCode), {
      tripId,
      title: trip.title,
    });
    await batch.commit();

    if (coverImageFile) {
      try {
        const coverImageUrl = await uploadFile(
          getTripCoverStoragePath(tripId),
          coverImageFile,
        );
        await updateDoc(tripRef, { coverImageUrl, lastEditedAt });
        trip.coverImageUrl = coverImageUrl;
        trip.lastEditedAt = lastEditedAt;
      } catch (error) {
        await deleteFile(getTripCoverStoragePath(tripId));
        throw error;
      }
    }

    dispatch(upsertTrip(trip));

    return trip;
  },
);

function getShiftedTimestamp(value: unknown, delta: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value + delta
    : null;
}

// Firestore caps a single batch at 500 writes; trips with hundreds of
// events/stays can exceed that, so timestamp-shift updates are committed in
// chunks rather than one batch.
const FIRESTORE_BATCH_LIMIT = 450;

async function commitInChunks(
  updates: { ref: DocumentReference; data: Record<string, number> }[],
) {
  for (let i = 0; i < updates.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = updates.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const chunkBatch = writeBatch(db);
    chunk.forEach(({ ref, data }) => chunkBatch.update(ref, data));
    await chunkBatch.commit();
  }
}

export const editTrip = createAsyncThunk<
  TripSpace,
  EditTripInput,
  { rejectValue: string }
>(
  'waypoint/trips/edit',
  async ({ uid, trip, values }, { dispatch, rejectWithValue }) => {
    const title = values.title.trim();
    let coverImageUrl = values.coverImageUrl?.trim() || null;
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
    const lastEditedAt = Date.now();

    if (values.coverImageFile) {
      coverImageUrl = await uploadFile(
        getTripCoverStoragePath(trip.id),
        values.coverImageFile,
      );
    } else if (values.coverImageRemoved) {
      coverImageUrl = null;
      await deleteFile(getTripCoverStoragePath(trip.id));
    }

    if (dateDelta !== 0) {
      const [eventsSnapshot, staysSnapshot] = await Promise.all([
        getDocs(collection(tripRef, 'events')),
        getDocs(collection(tripRef, 'stays')),
      ]);

      const timestampUpdates: {
        ref: DocumentReference;
        data: Record<string, number>;
      }[] = [];

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
          timestampUpdates.push({ ref: eventSnapshot.ref, data: updates });
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
          timestampUpdates.push({ ref: staySnapshot.ref, data: updates });
        }
      });

      await commitInChunks(timestampUpdates);
    }

    const tripBatch = writeBatch(db);
    tripBatch.update(tripRef, {
      title,
      startDate: values.startDate,
      endDate: values.endDate,
      coverImageUrl,
      defaultCurrency,
      lastEditedAt,
    });
    await tripBatch.commit();

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
