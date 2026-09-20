import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { CustomPreventiveType } from '@apps/nine-lives/types';

import { upsertCustomPreventiveType } from '../slices/customPreventiveTypesSlice';

const getTypesCollectionRef = (householdId: string) =>
  collection(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'customPreventiveTypes',
  );

export const createCustomPreventiveType = createAsyncThunk<
  CustomPreventiveType,
  { householdId: string; uid: string; label: string },
  { rejectValue: string }
>(
  'nineLives/customPreventiveTypes/create',
  async ({ householdId, uid, label }, { dispatch, getState, rejectWithValue }) => {
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return rejectWithValue('Custom preventive type is required.');
    }

    const state = getState() as RootState;
    const existing = state.nineLives.customPreventiveTypes.items.find(
      (type) =>
        type.householdId === householdId &&
        type.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const typeId = doc(getTypesCollectionRef(householdId)).id;
    const nextType: CustomPreventiveType = {
      id: typeId,
      householdId,
      label: trimmedLabel,
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(doc(getTypesCollectionRef(householdId), typeId), nextType);
    dispatch(upsertCustomPreventiveType(nextType));

    return nextType;
  },
);
