import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, FieldPath, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { ASSIGNABLE_MEMBER_ROLES } from '@apps/waypoint/constants';
import { removeMyPendingRequest } from '@apps/waypoint/store/slices/pendingRequestsSlice';
import type { TripEmailInvite, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isValidEmail = (email: string) => EMAIL_PATTERN.test(normalizeEmail(email));

function inviteRef(tripId: string, email: string) {
  return doc(db, 'apps', 'waypoint', 'emailInvites', `${tripId}_${normalizeEmail(email)}`);
}

export const inviteMemberByEmail = createAsyncThunk<
  TripEmailInvite,
  { trip: TripSpace; uid: string; email: string; role: TripEmailInvite['role'] },
  { rejectValue: string }
>('waypoint/emailInvites/invite', async ({ trip, uid, email, role }, { rejectWithValue }) => {
  if (!isTripAdmin(trip, uid)) {
    return rejectWithValue('Only an Admin can invite people by email.');
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
    // Inviting the same address again only changes the role they'll join with.
    const ref = inviteRef(trip.id, email);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, { role });
      return { ...(existing.data() as TripEmailInvite), role };
    }
    await setDoc(ref, invite);
    return invite;
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Unable to save this invitation.'));
  }
});

/** Takes back an invitation (an Admin) or turns one down (the person it was for). */
export const removeEmailInvite = createAsyncThunk<
  void,
  { tripId: string; email: string },
  { rejectValue: string }
>('waypoint/emailInvites/remove', async ({ tripId, email }, { rejectWithValue }) => {
  try {
    await deleteDoc(inviteRef(tripId, email));
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Unable to remove this invitation.'));
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
    return rejectWithValue(getErrorMessage(error, 'Unable to join this trip.'));
  }

  // A request sent earlier is moot now; failing to clear it leaves a harmless stale row for an Admin to decline.
  const pendingRef = doc(db, 'apps', 'waypoint', 'pendingRequests', `${uid}_${invite.tripId}`);
  await getDoc(pendingRef)
    .then((snapshot) => (snapshot.exists() ? deleteDoc(pendingRef) : undefined))
    .then(() => dispatch(removeMyPendingRequest({ uid, tripId: invite.tripId })))
    .catch(() => undefined);

  return invite.tripId;
});
