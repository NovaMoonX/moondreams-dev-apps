import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';

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

const INVITE_CODE_COLLECTION = collection(db, 'apps', 'nine-lives', 'inviteCodes');

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
    const snapshot = await getDoc(doc(INVITE_CODE_COLLECTION, candidate));

    if (!snapshot.exists()) {
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

    const batch = writeBatch(db);
    batch.set(doc(db, 'apps', 'nine-lives', 'households', householdId), household);
    batch.set(doc(INVITE_CODE_COLLECTION, inviteCode), { householdId });
    await batch.commit();

    dispatch(upsertHousehold(household));

    return household;
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
