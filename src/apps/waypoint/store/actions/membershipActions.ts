import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { ASSIGNABLE_MEMBER_ROLES } from '@apps/waypoint/constants';
import type {
  TripJoinRequest,
  TripSpace,
  UserRole,
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
  async ({ tripId, uid, role }, { dispatch, rejectWithValue }) => {
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role)) {
      return rejectWithValue('Choose a valid member role.');
    }

    const tripRef = doc(db, ...TRIP_COLLECTION_PATH, tripId);
    const requestRef = pendingRequestRef(uid, tripId);

    try {
      // Reads and writes happen inside one transaction so a concurrent
      // approval/role-change/removal on the same trip can't be silently
      // overwritten by a write based on a stale read of `members`.
      const request = await runTransaction(db, async (transaction) => {
        const tripSnapshot = await transaction.get(tripRef);
        if (!tripSnapshot.exists()) {
          throw new Error('Trip not found.');
        }

        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists()) {
          throw new Error('That request no longer exists.');
        }

        const trip: TripSpace = {
          id: tripSnapshot.id,
          ...(tripSnapshot.data() as Omit<TripSpace, 'id'>),
        };

        if (trip.members[uid]) {
          throw new Error('That user is already a member of this trip.');
        }

        const requestedAt = requestSnapshot.data().requestedAt;
        const approvedRequest: TripJoinRequest = {
          uid,
          tripId,
          requestedAt:
            typeof requestedAt === 'number' ? requestedAt : Date.now(),
        };
        const now = Date.now();

        transaction.update(tripRef, {
          members: {
            ...trip.members,
            [uid]: { uid, role, joinedAt: now },
          },
          lastEditedAt: now,
        });
        transaction.delete(requestRef);

        return approvedRequest;
      });

      dispatch(removeTripPendingRequest({ uid, tripId }));
      return request;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to approve this request.'),
      );
    }
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

export const changeRole = createAsyncThunk<
  TripSpace,
  { tripId: string; uid: string; role: UserRole; currentUserId: string },
  { rejectValue: string }
>(
  'waypoint/membership/changeRole',
  async ({ tripId, uid, role, currentUserId }, { rejectWithValue }) => {
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role) && role !== 'ADMIN') {
      return rejectWithValue('Choose a valid member role.');
    }

    const tripRef = doc(db, ...TRIP_COLLECTION_PATH, tripId);

    try {
      // Read the trip and write the role change inside one transaction so
      // two admins acting on the same trip at once can't clobber each
      // other's write with a `members` map read before the other's commit.
      return await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(tripRef);
        if (!snapshot.exists()) {
          throw new Error('Trip not found.');
        }

        const trip: TripSpace = {
          id: snapshot.id,
          ...(snapshot.data() as Omit<TripSpace, 'id'>),
        };

        if (!canChangeRole(trip, currentUserId, uid)) {
          throw new Error('You cannot change this member’s role.');
        }

        const updatedTrip: TripSpace = {
          ...trip,
          members: {
            ...trip.members,
            [uid]: { ...trip.members[uid], role },
          },
          lastEditedAt: Date.now(),
        };

        transaction.set(tripRef, updatedTrip);
        return updatedTrip;
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to change this member’s role.'),
      );
    }
  },
);

export const removeMember = createAsyncThunk<
  { tripId: string; uid: string },
  { tripId: string; uid: string; currentUserId: string },
  { rejectValue: string }
>(
  'waypoint/membership/removeMember',
  async ({ tripId, uid, currentUserId }, { rejectWithValue }) => {
    const tripRef = doc(db, ...TRIP_COLLECTION_PATH, tripId);

    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(tripRef);
        if (!snapshot.exists()) {
          throw new Error('Trip not found.');
        }

        const trip: TripSpace = {
          id: snapshot.id,
          ...(snapshot.data() as Omit<TripSpace, 'id'>),
        };

        if (!canRemoveMembers(trip, currentUserId, uid)) {
          throw new Error('You cannot remove this member.');
        }

        const members = { ...trip.members };
        delete members[uid];

        transaction.set(tripRef, {
          ...trip,
          members,
          lastEditedAt: Date.now(),
        });
      });

      return { tripId, uid };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to remove this member.'),
      );
    }
  },
);
