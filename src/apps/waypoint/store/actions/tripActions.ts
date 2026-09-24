import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@/lib/firebase/config';
import { getUniqueInviteCode } from '@/lib/firebase/firestore';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import { getErrorMessage } from '@/utils/errorUtils';
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
  /** Only meaningful when the trip's dates are actually changing and it has
   * dated items — see `EditTripModal`'s shift checkbox. */
  shiftDates: boolean;
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

interface SetSharedAlbumLinkInput {
  uid: string;
  trip: TripSpace;
  url: string | null;
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

interface ShiftTripDatesResponse {
  tripId: string;
  lastEditedAt: number;
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

    if (trip.dateShiftStatus === 'PENDING') {
      return rejectWithValue("This trip's dates are already being updated.");
    }

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

    const datesChanged =
      values.startDate !== trip.startDate || values.endDate !== trip.endDate;

    // Re-dating every event/stay/expense/checklist item can touch far more
    // documents than a client should write one at a time, so that work runs
    // server-side, where it can't time out the caller.
    if (datesChanged) {
      try {
        const shiftTripDates = httpsCallable<
          {
            tripId: string;
            title: string;
            startDate: number;
            endDate: number;
            coverImageUrl: string | null;
            defaultCurrency: string | null;
            shiftDates: boolean;
          },
          ShiftTripDatesResponse
        >(functions, 'shiftTripDates');
        await shiftTripDates({
          tripId: trip.id,
          title,
          startDate: values.startDate,
          endDate: values.endDate,
          coverImageUrl,
          defaultCurrency,
          shiftDates: values.shiftDates,
        });
      } catch (error) {
        return rejectWithValue(
          getErrorMessage(error, 'Unable to update this trip.'),
        );
      }
    } else {
      const tripBatch = writeBatch(db);
      tripBatch.update(tripRef, {
        title,
        coverImageUrl,
        defaultCurrency,
        lastEditedAt,
      });
      if (title !== trip.title && trip.inviteCode) {
        tripBatch.update(doc(INVITE_CODE_COLLECTION, trip.inviteCode), {
          title,
        });
      }
      await tripBatch.commit();
    }

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

export const setSharedAlbumLink = createAsyncThunk<
  TripSpace,
  SetSharedAlbumLinkInput,
  { rejectValue: string }
>(
  'waypoint/trips/setSharedAlbumLink',
  async ({ uid, trip, url }, { dispatch, rejectWithValue }) => {
    const trimmedUrl = url?.trim() || null;
    if (trimmedUrl !== null) {
      try {
        const parsedUrl = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Unsupported protocol');
        }
      } catch {
        return rejectWithValue('Enter a valid album link.');
      }
    }

    const memberRole = trip.members[uid]?.role;
    if (!memberRole) {
      return rejectWithValue('You must be a trip member to set the album link.');
    }
    if (
      trip.sharedAlbumUrl !== null &&
      !['ADMIN', 'EDITOR'].includes(memberRole)
    ) {
      return rejectWithValue('Only Editors and Admins can change the album link.');
    }

    const sharedAlbumSetAt = trimmedUrl === null ? null : Date.now();
    const updatedTrip: TripSpace = {
      ...trip,
      sharedAlbumUrl: trimmedUrl,
      sharedAlbumSetByUid: trimmedUrl === null ? null : uid,
      sharedAlbumSetAt,
      lastEditedAt: Date.now(),
    };
    const batch = writeBatch(db);
    batch.update(doc(db, ...TRIP_COLLECTION_PATH, trip.id), {
      sharedAlbumUrl: updatedTrip.sharedAlbumUrl,
      sharedAlbumSetByUid: updatedTrip.sharedAlbumSetByUid,
      sharedAlbumSetAt: updatedTrip.sharedAlbumSetAt,
      lastEditedAt: updatedTrip.lastEditedAt,
    });
    await batch.commit();
    dispatch(upsertTrip(updatedTrip));
    return updatedTrip;
  },
);
