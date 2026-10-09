import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { arrayRemove, arrayUnion, collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@/lib/firebase/config';
import { getUniqueInviteCode } from '@/lib/firebase/firestore';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import { getErrorMessage } from '@/utils/errorUtils';
import { isValidHttpUrl } from '@/utils/urlUtils';
import type { TripCity, TripSpace } from '@apps/waypoint/types';
import { isRelativeTrip } from '@apps/waypoint/utils/tripTime';
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
  timezone: string;
  city: TripCity | null;
}

export interface EditTripValues {
  title: string;
  startDate: number;
  endDate: number;
  coverImageUrl: string | null;
  coverImageFile: File | null;
  coverImageRemoved: boolean;
  defaultCurrency: string | null;
  /** The trip's default time zone; saved in the same write as the dates so the two can't diverge. */
  timezone: string | null;
  /** Only meaningful when the start date moves: items keep their calendar dates and their
   * day numbers are rebased, instead of moving along with the trip. */
  keepOriginalDates: boolean;
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
    { uid, title, startDate, endDate, timezone, city },
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
      timezone,
      city,
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

interface ShiftTripDatesResponse {
  tripId: string;
  lastEditedAt: number;
}

// The function's own errors carry copy written for people, but anything it
// didn't throw deliberately (a crash, a timeout, an unreachable function)
// reaches the client as code `functions/internal` with the message "internal".
const SHIFT_TRIP_DATES_READABLE_CODES = [
  'functions/unauthenticated',
  'functions/permission-denied',
  'functions/not-found',
  'functions/failed-precondition',
  'functions/invalid-argument',
];

function getShiftTripDatesErrorMessage(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : null;
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
    return "We couldn't reach the server to update your trip's dates. Check your connection and try again.";
  }
  if (code && SHIFT_TRIP_DATES_READABLE_CODES.includes(code)) {
    return getErrorMessage(error, "We couldn't update your trip's dates.");
  }

  return "Something went wrong while updating your trip's dates. Give it another try in a moment — if it keeps happening, let us know.";
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
    const timezone = values.timezone?.trim() || null;
    const timezoneChanged = timezone !== null && timezone !== (trip.timezone ?? null);
    if ((datesChanged || timezoneChanged) && !isRelativeTrip(trip)) {
      return rejectWithValue("This trip's dates are fixed.");
    }

    // Rebasing every item's day number can touch more documents than a client should write
    // one at a time, and editors can't write events/stays on a live trip, so it runs server-side.
    const rebasesItems = datesChanged && values.keepOriginalDates && values.startDate !== trip.startDate;
    if (rebasesItems) {
      try {
        const shiftTripDates = httpsCallable<
          {
            tripId: string;
            title: string;
            startDate: number;
            endDate: number;
            coverImageUrl: string | null;
            defaultCurrency: string | null;
            timezone: string | null;
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
          timezone: timezoneChanged ? timezone : null,
        });
      } catch (error) {
        return rejectWithValue(getShiftTripDatesErrorMessage(error));
      }
    } else {
      const tripBatch = writeBatch(db);
      tripBatch.update(tripRef, {
        title,
        coverImageUrl,
        defaultCurrency,
        ...(datesChanged ? { startDate: values.startDate, endDate: values.endDate } : {}),
        ...(timezoneChanged ? { timezone } : {}),
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
      ...(timezoneChanged ? { timezone } : {}),
      lastEditedAt,
    };
    dispatch(upsertTrip(updatedTrip));
    return updatedTrip;
  },
);

export const setTripCity = createAsyncThunk<
  TripSpace,
  { uid: string; trip: TripSpace; city: TripCity | null },
  { rejectValue: string }
>('waypoint/trips/setCity', async ({ uid, trip, city }, { dispatch, rejectWithValue }) => {
  if (!['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '')) {
    return rejectWithValue('You do not have permission to edit this trip.');
  }

  const lastEditedAt = Date.now();
  await updateDoc(doc(db, ...TRIP_COLLECTION_PATH, trip.id), { city, lastEditedAt });
  const updatedTrip: TripSpace = { ...trip, city, lastEditedAt };
  dispatch(upsertTrip(updatedTrip));
  return updatedTrip;
});

export const setPlanNeedsNoExpense = createAsyncThunk<
  TripSpace,
  { uid: string; trip: TripSpace; linkKey: string; needsNone: boolean },
  { rejectValue: string }
>('waypoint/trips/setPlanNeedsNoExpense', async ({ uid, trip, linkKey, needsNone }, { rejectWithValue }) => {
  if (!['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '')) {
    return rejectWithValue('You do not have permission to edit this trip.');
  }

  const lastEditedAt = Date.now();
  await updateDoc(doc(db, ...TRIP_COLLECTION_PATH, trip.id), {
    noExpenseKeys: needsNone ? arrayUnion(linkKey) : arrayRemove(linkKey),
    lastEditedAt,
  });
  return { ...trip, lastEditedAt };
});

export const setPlanNeedsNoBooking = createAsyncThunk<
  TripSpace,
  { uid: string; trip: TripSpace; linkKey: string; needsNone: boolean },
  { rejectValue: string }
>('waypoint/trips/setPlanNeedsNoBooking', async ({ uid, trip, linkKey, needsNone }, { rejectWithValue }) => {
  if (!['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '')) {
    return rejectWithValue('You do not have permission to edit this trip.');
  }

  const lastEditedAt = Date.now();
  await updateDoc(doc(db, ...TRIP_COLLECTION_PATH, trip.id), {
    noBookingKeys: needsNone ? arrayUnion(linkKey) : arrayRemove(linkKey),
    lastEditedAt,
  });
  return { ...trip, lastEditedAt };
});

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
    if (trimmedUrl !== null && !isValidHttpUrl(trimmedUrl)) {
      return rejectWithValue('Enter a valid album link.');
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

interface DeleteTripInput {
  uid: string;
  trip: TripSpace;
}

export const deleteTrip = createAsyncThunk<string, DeleteTripInput, { rejectValue: string }>(
  'waypoint/trips/delete',
  async ({ uid, trip }, { rejectWithValue }) => {
    if (trip.members[uid]?.role !== 'ADMIN') {
      return rejectWithValue('Only trip admins can delete this trip.');
    }

    try {
      const deleteTripCallable = httpsCallable<{ tripId: string }, { tripId: string }>(
        functions,
        'deleteTrip',
      );
      await deleteTripCallable({ tripId: trip.id });
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "We couldn't delete this trip. Please try again."));
    }

    return trip.id;
  },
);
