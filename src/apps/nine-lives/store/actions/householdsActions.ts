import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Household } from '@apps/nine-lives/types';

import { upsertHousehold } from '../slices/householdsSlice';

interface CreateHouseholdInput {
  uid: string;
  name: string;
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
    const household: Household = {
      id: householdId,
      name: trimmedName,
      members: [uid],
      inviteCode: null,
      pendingMembers: [],
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(doc(db, 'apps', 'nine-lives', 'households', householdId), household);
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
