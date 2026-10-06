import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, FieldPath, getDoc, setDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { ASSIGNABLE_MEMBER_ROLES } from '@apps/waypoint/constants';
import { removeMyPendingRequest } from '@apps/waypoint/store/slices/pendingRequestsSlice';
import type { TripEmailInvite, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_PATTERN = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

export const isValidEmail = (email: string) => EMAIL_PATTERN.test(normalizeEmail(email));

function inviteRef(tripId: string, email: string) {
  return doc(db, 'apps', 'waypoint', 'emailInvites', `${tripId}_${normalizeEmail(email)}`);
}

export const addMemberByEmail = createAsyncThunk<
  TripEmailInvite,
  { trip: TripSpace; uid: string; email: string; role: TripEmailInvite['role'] },
  { rejectValue: string }
>('waypoint/emailInvites/add', async ({ trip, uid, email, role }, { rejectWithValue }) => {
  if (!isTripAdmin(trip, uid)) {
    return rejectWithValue('Only an Admin can add people by email.');
  }
  if (!isValidEmail(email)) {
    return rejectWithValue('Enter a valid email address.');
  }
  if (!ASSIGNABLE_MEMBER_ROLES.includes(role)) {
    return rejectWithValue('Choose a valid member role.');
  }

  const invite: TripEmailInvite = {
    tripId: trip.id,
    email: normalizeEmail(email),
    role,
    invitedBy: uid,
    invitedAt: Date.now(),
  };

  try {
    await setDoc(inviteRef(trip.id, email), invite);
    return invite;
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Unable to add this person.'));
  }
});

/** Takes someone back off the list (an Admin) or declines being on it (the person it was for). */
export const removeEmailInvite = createAsyncThunk<
  void,
  { tripId: string; email: string },
  { rejectValue: string }
>('waypoint/emailInvites/remove', async ({ tripId, email }, { rejectWithValue }) => {
  try {
    await deleteDoc(inviteRef(tripId, email));
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Unable to remove this person.'));
  }
});

/** The invited person joins with the role they were given, and the invitation is used up in the same commit.
 * They can't read the trip yet, so the member is written by path rather than read-modify-write. */
export const acceptEmailInvite = createAsyncThunk<
  string,
  { uid: string; invite: TripEmailInvite },
  { rejectValue: string }
>('waypoint/emailInvites/accept', async ({ uid, invite }, { dispatch, rejectWithValue }) => {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(
    doc(db, 'apps', 'waypoint', 'trips', invite.tripId),
    new FieldPath('members', uid),
    { uid, role: invite.role, joinedAt: now },
    'lastEditedAt',
    now,
  );
  batch.delete(inviteRef(invite.tripId, invite.email));

  try {
    await batch.commit();
  } catch (error) {
    console.error('Joining from an email invitation failed', error);
    const isDenied = typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
    return rejectWithValue(
      isDenied
        ? "We couldn't add you to this trip. You may already be on it, or an Admin may have changed your invitation."
        : getErrorMessage(error, 'Unable to join this trip. Check your connection and try again.'),
    );
  }

  // A request sent earlier is moot now; failing to clear it leaves a harmless stale row for an Admin to decline.
  const pendingRef = doc(db, 'apps', 'waypoint', 'pendingRequests', `${uid}_${invite.tripId}`);
  await getDoc(pendingRef)
    .then((snapshot) => (snapshot.exists() ? deleteDoc(pendingRef) : undefined))
    .then(() => dispatch(removeMyPendingRequest({ uid, tripId: invite.tripId })))
    .catch(() => undefined);

  return invite.tripId;
});
