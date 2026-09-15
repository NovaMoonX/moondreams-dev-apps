import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { CustomHealthRecordType } from '@apps/nine-lives/types';

import { upsertCustomHealthRecordType } from '../slices/customHealthRecordTypesSlice';

const getTypesCollectionRef = (householdId: string) =>
  collection(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'customHealthRecordTypes',
  );

export const createCustomHealthRecordType = createAsyncThunk<
  CustomHealthRecordType,
  { householdId: string; uid: string; label: string },
  { rejectValue: string }
>(
  'nineLives/customHealthRecordTypes/create',
  async ({ householdId, uid, label }, { dispatch, getState, rejectWithValue }) => {
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return rejectWithValue('Custom record type is required.');
    }

    const state = getState() as RootState;
    const existing = state.nineLives.customHealthRecordTypes.items.find(
      (type) =>
        type.householdId === householdId &&
        type.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const typeId = doc(getTypesCollectionRef(householdId)).id;
    const nextType: CustomHealthRecordType = {
      id: typeId,
      householdId,
      label: trimmedLabel,
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(doc(getTypesCollectionRef(householdId), typeId), nextType);
    dispatch(upsertCustomHealthRecordType(nextType));

    return nextType;
  },
);
