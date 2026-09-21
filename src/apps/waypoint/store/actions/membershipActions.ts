import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  ASSIGNABLE_MEMBER_ROLES,
  type TripJoinRequest,
  type TripSpace,
  type UserRole,
} from '@apps/waypoint/types';
import { TRIP_COLLECTION_PATH } from '@apps/waypoint/security';
import {
  removeMyPendingRequest,
  removeTripPendingRequest,
  upsertMyPendingRequest,
} from '@apps/waypoint/store/slices/pendingRequestsSlice';
import { canChangeRole, canRemoveMembers } from '@apps/waypoint/utils/roleGuards';

const PENDING_REQUESTS_COLLECTION = collection(
  db,
  'apps',
  'waypoint',
  'pendingRequests',
);

function pendingRequestId(uid: string, tripId: string) {
  return `${uid}_${tripId}`;
}

function pendingRequestRef(uid: string, tripId: string) {
  return doc(PENDING_REQUESTS_COLLECTION, pendingRequestId(uid, tripId));
}

export const requestToJoinTrip = createAsyncThunk<
  TripJoinRequest,
  { uid: string; inviteCode: string },
  { rejectValue: string }
>(
  'waypoint/membership/request',
  async ({ uid, inviteCode }, { dispatch, getState, rejectWithValue }) => {
    const trimmedCode = inviteCode.trim().toUpperCase();

    if (!trimmedCode) {
      return rejectWithValue('Enter a valid invite code.');
    }

    const inviteSnapshot = await getDoc(
      doc(db, 'apps', 'waypoint', 'inviteCodes', trimmedCode),
    );

    if (!inviteSnapshot.exists()) {
      return rejectWithValue('That invite code does not match a trip.');
    }

    const tripId = inviteSnapshot.data().tripId;
    if (typeof tripId !== 'string' || !tripId) {
      return rejectWithValue('That invite code is no longer available.');
    }

    const state = getState() as RootState;
    if (state.waypoint.trip.items.some((trip) => trip.id === tripId)) {
      return rejectWithValue('You are already a member of this trip.');
    }

    const requestRef = pendingRequestRef(uid, tripId);
    const existingRequest = await getDoc(requestRef);
    if (existingRequest.exists()) {
      return rejectWithValue(
        'You already have a pending request for this trip.',
      );
    }

    const request: TripJoinRequest = {
      uid,
      tripId,
      requestedAt: Date.now(),
    };

    await setDoc(requestRef, request);
    dispatch(upsertMyPendingRequest(request));

    return request;
  },
);

export const approveJoinRequest = createAsyncThunk<
  TripJoinRequest,
  { tripId: string; uid: string; role: UserRole },
  { rejectValue: string }
>(
  'waypoint/membership/approve',
  async ({ tripId, uid, role }, { dispatch, getState, rejectWithValue }) => {
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role)) {
      return rejectWithValue('Choose a valid member role.');
    }

    const state = getState() as RootState;
    let trip = state.waypoint.trip.items.find((item) => item.id === tripId);

    if (!trip) {
      const tripSnapshot = await getDoc(
        doc(db, ...TRIP_COLLECTION_PATH, tripId),
      );

      if (!tripSnapshot.exists()) {
        return rejectWithValue('Trip not found.');
      }

      trip = {
        id: tripSnapshot.id,
        ...(tripSnapshot.data() as Omit<TripSpace, 'id'>),
      };
    }

    const requestRef = pendingRequestRef(uid, tripId);
    const requestSnapshot = await getDoc(requestRef);

    if (!requestSnapshot.exists()) {
      return rejectWithValue('That request no longer exists.');
    }

    if (trip.members[uid]) {
      return rejectWithValue('That user is already a member of this trip.');
    }

    const requestedAt = requestSnapshot.data().requestedAt;
    const request: TripJoinRequest = {
      uid,
      tripId,
      requestedAt: typeof requestedAt === 'number' ? requestedAt : Date.now(),
    };
    const now = Date.now();
    const nextMembers = {
      ...trip.members,
      [uid]: {
        uid,
        role,
        joinedAt: now,
      },
    };

    const batch = writeBatch(db);
    batch.update(doc(db, ...TRIP_COLLECTION_PATH, tripId), {
      members: nextMembers,
      lastEditedAt: now,
    });
    batch.delete(requestRef);
    await batch.commit();

    dispatch(removeTripPendingRequest({ uid, tripId }));

    return request;
  },
);

export const declineJoinRequest = createAsyncThunk<
  { uid: string; tripId: string },
  { uid: string; tripId: string },
  { rejectValue: string }
>(
  'waypoint/membership/decline',
  async ({ uid, tripId }, { dispatch, rejectWithValue }) => {
    try {
      await deleteDoc(pendingRequestRef(uid, tripId));
      dispatch(removeTripPendingRequest({ uid, tripId }));
      return { uid, tripId };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to decline this request.'),
      );
    }
  },
);

// Lets a requester pull back a request they sent before an Admin acts on it.
export const cancelJoinRequest = createAsyncThunk<
  { uid: string; tripId: string },
  { uid: string; tripId: string },
  { rejectValue: string }
>(
  'waypoint/membership/cancel',
  async ({ uid, tripId }, { dispatch, rejectWithValue }) => {
    try {
      await deleteDoc(pendingRequestRef(uid, tripId));
      dispatch(removeMyPendingRequest({ uid, tripId }));
      return { uid, tripId };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to withdraw this request.'),
      );
    }
  },
);

async function getTrip(tripId: string, state: RootState) {
  const trip = state.waypoint.trip.items.find((item) => item.id === tripId);
  if (trip) {
    return trip;
  }

  const snapshot = await getDoc(doc(db, ...TRIP_COLLECTION_PATH, tripId));
  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<TripSpace, 'id'>),
  };
}

export const changeRole = createAsyncThunk<
  TripSpace,
  { tripId: string; uid: string; role: UserRole; currentUserId: string },
  { rejectValue: string }
>(
  'waypoint/membership/changeRole',
  async (
    { tripId, uid, role, currentUserId },
    { getState, rejectWithValue },
  ) => {
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role) && role !== 'ADMIN') {
      return rejectWithValue('Choose a valid member role.');
    }

    const trip = await getTrip(tripId, getState() as RootState);
    if (!trip) {
      return rejectWithValue('Trip not found.');
    }

    if (!canChangeRole(trip, currentUserId, uid)) {
      return rejectWithValue('You cannot change this member’s role.');
    }

    const updatedTrip = {
      ...trip,
      members: {
        ...trip.members,
        [uid]: { ...trip.members[uid], role },
      },
      lastEditedAt: Date.now(),
    };

    await setDoc(doc(db, ...TRIP_COLLECTION_PATH, tripId), updatedTrip);
    return updatedTrip;
  },
);

export const removeMember = createAsyncThunk<
  { tripId: string; uid: string },
  { tripId: string; uid: string; currentUserId: string },
  { rejectValue: string }
>(
  'waypoint/membership/removeMember',
  async ({ tripId, uid, currentUserId }, { getState, rejectWithValue }) => {
    const trip = await getTrip(tripId, getState() as RootState);
    if (!trip) {
      return rejectWithValue('Trip not found.');
    }

    if (!canRemoveMembers(trip, currentUserId, uid)) {
      return rejectWithValue('You cannot remove this member.');
    }

    const members = { ...trip.members };
    delete members[uid];
    await setDoc(doc(db, ...TRIP_COLLECTION_PATH, tripId), {
      ...trip,
      members,
      lastEditedAt: Date.now(),
    });

    return { tripId, uid };
  },
);
