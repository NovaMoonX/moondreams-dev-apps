import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Household, PendingHouseholdRequest } from '@apps/nine-lives/types';

import { upsertHousehold } from '../slices/householdsSlice';
import {
  removePendingRequest,
  upsertPendingRequest,
} from '../slices/pendingRequestsSlice';

export const requestToJoinHousehold = createAsyncThunk<
  PendingHouseholdRequest,
  { inviteCode: string; uid: string },
  { rejectValue: string }
>(
  'nineLives/pendingRequests/request',
  async ({ inviteCode, uid }, { dispatch, getState, rejectWithValue }) => {
    const trimmedCode = inviteCode.trim().toUpperCase();

    if (!trimmedCode) {
      return rejectWithValue('Enter a valid invite code.');
    }

    const inviteCodeSnapshot = await getDoc(
      doc(db, 'apps', 'nine-lives', 'inviteCodes', trimmedCode),
    );

    if (!inviteCodeSnapshot.exists()) {
      return rejectWithValue('That invite code does not match a household.');
    }

    const { householdId } = inviteCodeSnapshot.data() as { householdId: string };

    const state = getState() as RootState;
    const isAlreadyMember = state.nineLives.households.items.some(
      (item) => item.id === householdId,
    );

    if (isAlreadyMember) {
      return rejectWithValue('You are already a member of this household.');
    }

    const requestedAt = Date.now();
    const request: PendingHouseholdRequest = {
      uid,
      householdId,
      requestedAt,
    };

    const requestRef = doc(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'pendingRequests',
      uid,
    );

    await setDoc(requestRef, request);
    dispatch(upsertPendingRequest(request));

    return request;
  },
);

export const approveRequest = createAsyncThunk<
  PendingHouseholdRequest,
  { householdId: string; uid: string },
  { rejectValue: string }
>(
  'nineLives/pendingRequests/approve',
  async ({ householdId, uid }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    let household = state.nineLives.households.items.find(
      (item) => item.id === householdId,
    );

    if (!household) {
      const householdSnapshot = await getDoc(
        doc(db, 'apps', 'nine-lives', 'households', householdId),
      );

      if (!householdSnapshot.exists()) {
        return rejectWithValue('Household not found.');
      }

      household = {
        id: householdSnapshot.id,
        ...(householdSnapshot.data() as Omit<Household, 'id'>),
      } as Household;
    }

    const requestRef = doc(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'pendingRequests',
      uid,
    );
    const requestSnapshot = await getDoc(requestRef);

    if (!requestSnapshot.exists()) {
      return rejectWithValue('That request no longer exists.');
    }

    if (household.members.includes(uid)) {
      await deleteDoc(requestRef);
      dispatch(removePendingRequest({ householdId, uid }));
      return rejectWithValue('That user is already a member of this household.');
    }

    const now = Date.now();
    const nextMembers = Array.from(new Set([...household.members, uid]));
    const batch = writeBatch(db);

    batch.update(doc(db, 'apps', 'nine-lives', 'households', householdId), {
      members: nextMembers,
      lastEditedAt: now,
    });
    batch.delete(requestRef);
    await batch.commit();

    const approvedRequest: PendingHouseholdRequest = {
      uid,
      householdId,
      requestedAt:
        typeof requestSnapshot.data()?.requestedAt === 'number'
          ? requestSnapshot.data()!.requestedAt
          : now,
    };

    dispatch(
      upsertHousehold({
        ...household,
        members: nextMembers,
        lastEditedAt: now,
      }),
    );
    dispatch(removePendingRequest({ householdId, uid }));

    return approvedRequest;
  },
);

export const declineRequest = createAsyncThunk<
  { householdId: string; uid: string },
  { householdId: string; uid: string },
  { rejectValue: string }
>(
  'nineLives/pendingRequests/decline',
  async ({ householdId, uid }, { dispatch, rejectWithValue }) => {
    const requestRef = doc(
      db,
      'apps',
      'nine-lives',
      'households',
      householdId,
      'pendingRequests',
      uid,
    );

    try {
      await deleteDoc(requestRef);
      dispatch(removePendingRequest({ householdId, uid }));
      return { householdId, uid };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to decline request.',
      );
    }
  },
);
