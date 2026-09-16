import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { CustomLitterType } from '@apps/nine-lives/types';

import { upsertCustomLitterType } from '../slices/customLitterTypesSlice';

const getTypesCollectionRef = (householdId: string) =>
  collection(db, 'apps', 'nine-lives', 'households', householdId, 'customLitterTypes');

export const createCustomLitterType = createAsyncThunk<
  CustomLitterType,
  { householdId: string; uid: string; label: string },
  { rejectValue: string }
>(
  'nineLives/customLitterTypes/create',
  async ({ householdId, uid, label }, { dispatch, getState, rejectWithValue }) => {
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return rejectWithValue('Custom litter type is required.');
    }

    const state = getState() as RootState;
    const existing = state.nineLives.customLitterTypes.items.find(
      (type) =>
        type.householdId === householdId &&
        type.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const typeId = doc(getTypesCollectionRef(householdId)).id;
    const nextType: CustomLitterType = {
      id: typeId,
      householdId,
      label: trimmedLabel,
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(doc(getTypesCollectionRef(householdId), typeId), nextType);
    dispatch(upsertCustomLitterType(nextType));

    return nextType;
  },
);
