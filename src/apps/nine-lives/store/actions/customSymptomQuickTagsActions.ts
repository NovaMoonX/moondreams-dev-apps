import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { CustomSymptomQuickTag } from '@apps/nine-lives/types';

import { upsertCustomSymptomQuickTag } from '../slices/customSymptomQuickTagsSlice';

const getQuickTagsCollectionRef = (householdId: string) =>
  collection(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'customSymptomQuickTags',
  );

export const createCustomSymptomQuickTag = createAsyncThunk<
  CustomSymptomQuickTag,
  { householdId: string; uid: string; label: string },
  { rejectValue: string }
>(
  'nineLives/customSymptomQuickTags/create',
  async ({ householdId, uid, label }, { dispatch, getState, rejectWithValue }) => {
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return rejectWithValue('Custom tag name is required.');
    }

    const state = getState() as RootState;
    const existing = state.nineLives.customSymptomQuickTags.items.find(
      (tag) =>
        tag.householdId === householdId &&
        tag.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const tagId = doc(getQuickTagsCollectionRef(householdId)).id;
    const nextTag: CustomSymptomQuickTag = {
      id: tagId,
      householdId,
      label: trimmedLabel,
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(doc(getQuickTagsCollectionRef(householdId), tagId), nextTag);
    dispatch(upsertCustomSymptomQuickTag(nextTag));

    return nextTag;
  },
);
