import { createAsyncThunk } from '@reduxjs/toolkit';
import { arrayUnion, collection, deleteDoc, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Stay, StayChangeSnapshot, StayFieldChange, TripSpace } from '@apps/waypoint/types';
import { canCreateItem, canEditExistingItem, isTripActive } from '@apps/waypoint/utils/roleGuards';

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
  previousStay: Stay;
}

const TRACKED_STAY_CHANGE_FIELDS = ['checkInAt', 'checkOutAt'] as const;

function buildStayChangeSnapshot(
  previousStay: Stay,
  nextStay: StayFields,
  uid: string,
): StayChangeSnapshot | null {
  const now = Date.now();
  const changes: StayFieldChange[] = TRACKED_STAY_CHANGE_FIELDS.filter(
    (field) => previousStay[field] !== nextStay[field],
  ).map((field) => ({
    field,
    previousValue: previousStay[field],
    changedBy: uid,
    changedAt: now,
  }));

  if (changes.length === 0) {
    return null;
  }

  return { changes, latestChangedBy: uid, latestChangedAt: now };
}

interface DeleteStayInput {
  uid: string;
  trip: TripSpace;
  stayId: string;
}

export const createStay = createAsyncThunk<
  Stay,
  CreateStayInput,
  { rejectValue: string }
>('waypoint/stays/create', async ({ uid, trip, stay }, { rejectWithValue }) => {
  if (!canCreateItem(trip, uid)) {
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
    linkUrl: stay.linkUrl?.trim() || null,
    linkPreview: stay.linkUrl?.trim() ? stay.linkPreview : null,
    changeHistory: [],
    seenBy: { [uid]: now },
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
>('waypoint/stays/update', async ({ uid, trip, stayId, stay, previousStay }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit stays.');
  }
  const validationError = validateStay(stay);
  if (validationError) {
    return rejectWithValue(validationError);
  }

  const stayRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'stays', stayId);
  const newSnapshot = isTripActive(trip) ? buildStayChangeSnapshot(previousStay, stay, uid) : null;
  // `seenBy` and `changeHistory` change independently of this form, so the cached copies
  // are never written back — history is appended server-side instead.
  const editableFields = Object.fromEntries(
    Object.entries(stay).filter(([key]) => key !== 'seenBy' && key !== 'changeHistory'),
  );
  const changes = {
    ...getMissingStayFields(previousStay),
    ...editableFields,
    id: stayId,
    tripId: trip.id,
    name: stay.name.trim(),
    address: stay.address.trim(),
    checkInTimezone: stay.checkInTimezone?.trim() || null,
    confirmationCode: stay.confirmationCode?.trim() || null,
    notes: stay.notes?.trim() || null,
    linkUrl: stay.linkUrl?.trim() || null,
    linkPreview: stay.linkUrl?.trim() ? stay.linkPreview : null,
    ...(newSnapshot ? { changeHistory: arrayUnion(newSnapshot) } : {}),
    lastEditedAt: Date.now(),
  };

  await updateDoc(stayRef, changes);
  return stay;
});

// The rule validates the whole merged document, so a stay saved before these
// fields existed needs them written alongside any partial update.
function getMissingStayFields(stay: Stay): Partial<Stay> {
  const defaults: Partial<Stay> = {
    stayType: 'OTHER',
    checkInTimezone: null,
    plannedArrivalAt: stay.checkInAt,
    plannedDepartureAt: stay.checkOutAt,
    confirmationCode: null,
    place: null,
    linkUrl: null,
    linkPreview: null,
    changeHistory: [],
    seenBy: {},
  };
  const missing = Object.fromEntries(
    Object.entries(defaults).filter(([key]) => !(key in stay)),
  ) as Partial<Stay>;
  return missing;
}

interface UpdateStayNotesInput {
  uid: string;
  trip: TripSpace;
  stay: Stay;
  notes: string;
}

export const updateStayNotes = createAsyncThunk<
  Stay,
  UpdateStayNotesInput,
  { rejectValue: string }
>('waypoint/stays/updateNotes', async ({ uid, trip, stay, notes }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit this stay.');
  }

  const changes = {
    ...getMissingStayFields(stay),
    notes: notes.trim() || null,
    lastEditedAt: Date.now(),
  };
  await updateDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'stays', stay.id), changes);
  return { ...stay, ...changes };
});

export const deleteStay = createAsyncThunk<
  string,
  DeleteStayInput,
  { rejectValue: string }
>('waypoint/stays/delete', async ({ uid, trip, stayId }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to delete stays.');
  }
  await deleteDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'stays', stayId));
  return stayId;
});

interface MarkStaySeenInput {
  uid: string;
  trip: TripSpace;
  stayId: string;
}

export const markStaySeen = createAsyncThunk<void, MarkStaySeenInput, { rejectValue: string }>(
  'waypoint/stays/markSeen',
  async ({ uid, trip, stayId }) => {
    const stayRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'stays', stayId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(stayRef);
      if (!snapshot.exists()) {
        return;
      }
      const seenBy = (snapshot.data().seenBy ?? {}) as Record<string, number>;
      transaction.update(stayRef, { seenBy: { ...seenBy, [uid]: Date.now() } });
    });
  },
);
