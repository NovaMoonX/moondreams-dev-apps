import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Household } from '@apps/nine-lives/types';

import { upsertHousehold } from '../slices/householdsSlice';

interface CreateHouseholdInput {
  uid: string;
  name: string;
}

const HOUSEHOLD_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOUSEHOLD_CODE_LENGTH = 6;

function generateHouseholdInviteCode() {
  let code = '';

  for (let index = 0; index < HOUSEHOLD_CODE_LENGTH; index += 1) {
    code +=
      HOUSEHOLD_CODE_ALPHABET[
        Math.floor(Math.random() * HOUSEHOLD_CODE_ALPHABET.length)
      ];
  }

  return code;
}

async function getUniqueHouseholdInviteCode(): Promise<string> {
  let candidate = generateHouseholdInviteCode();

  while (true) {
    const householdQuery = query(
      collection(db, 'apps', 'nine-lives', 'households'),
      where('inviteCode', '==', candidate),
    );
    const snapshot = await getDocs(householdQuery);

    if (snapshot.empty) {
      return candidate;
    }

    candidate = generateHouseholdInviteCode();
  }
}

export const createHousehold = createAsyncThunk<
  Household,
  CreateHouseholdInput,
  { rejectValue: string }
>(
  'nineLives/households/create',
  async ({ uid, name }, { dispatch, rejectWithValue }) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return rejectWithValue('Household name is required.');
    }

    const householdId = doc(collection(db, 'apps', 'nine-lives', 'households')).id;
    const now = Date.now();
    const inviteCode = await getUniqueHouseholdInviteCode();
    const household: Household = {
      id: householdId,
      name: trimmedName,
      members: [uid],
      inviteCode,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(doc(db, 'apps', 'nine-lives', 'households', householdId), household);
    dispatch(upsertHousehold(household));

    return household;
  },
);

export const joinHousehold = createAsyncThunk<
  Household,
  { householdId: string; uid: string },
  { rejectValue: string }
>(
  'nineLives/households/join',
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

    if (household.members.includes(uid)) {
      return rejectWithValue('You are already a member of this household.');
    }

    const updatedHousehold: Household = {
      ...household,
      members: Array.from(new Set([...household.members, uid])),
      lastEditedAt: Date.now(),
    };

    await updateDoc(doc(db, 'apps', 'nine-lives', 'households', householdId), {
      members: updatedHousehold.members,
      lastEditedAt: updatedHousehold.lastEditedAt,
    });
    dispatch(upsertHousehold(updatedHousehold));

    return updatedHousehold;
  },
);

export const renameHousehold = createAsyncThunk<
  Household,
  { householdId: string; name: string },
  { rejectValue: string }
>(
  'nineLives/households/rename',
  async ({ householdId, name }, { dispatch, getState, rejectWithValue }) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return rejectWithValue('Household name is required.');
    }

    const state = getState() as RootState;
    const household = state.nineLives.households.items.find(
      (item) => item.id === householdId,
    );

    if (!household) {
      return rejectWithValue('Household not found.');
    }

    const updatedHousehold: Household = {
      ...household,
      name: trimmedName,
      lastEditedAt: Date.now(),
    };

    await updateDoc(doc(db, 'apps', 'nine-lives', 'households', householdId), {
      name: trimmedName,
      lastEditedAt: updatedHousehold.lastEditedAt,
    });
    dispatch(upsertHousehold(updatedHousehold));

    return updatedHousehold;
  },
);
