import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  ChecklistCategory,
  ChecklistItem,
} from '@apps/waypoint/types';

const CHECKLIST_COLLECTION = (tripId: string) =>
  collection(db, 'apps', 'waypoint', 'trips', tripId, 'checklist');

interface CreateChecklistItemInput {
  tripId: string;
  uid: string;
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null;
  assignedToUids: string[];
}

export const createChecklistItem = createAsyncThunk<
  ChecklistItem,
  CreateChecklistItemInput,
  { rejectValue: string }
>(
  'waypoint/checklist/create',
  async (
    {
      tripId,
      uid,
      title,
      category,
      customCategoryLabel,
      assignedToUids,
    },
    { rejectWithValue },
  ) => {
    const trimmedTitle = title.trim();
    const trimmedCustomLabel = customCategoryLabel?.trim() || null;

    if (!trimmedTitle) {
      return rejectWithValue('Checklist title is required.');
    }
    if (category === 'OTHER' && !trimmedCustomLabel) {
      return rejectWithValue('Enter a label for the custom category.');
    }

    const now = Date.now();
    const itemRef = doc(CHECKLIST_COLLECTION(tripId));
    const item: ChecklistItem = {
      id: itemRef.id,
      tripId,
      title: trimmedTitle,
      category,
      customCategoryLabel: category === 'OTHER' ? trimmedCustomLabel : null,
      assignedToUids: [...new Set(assignedToUids)],
      isCompleted: false,
      markedCompletedByUid: null,
      markedCompletedAt: null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(itemRef, item);
    return item;
  },
);

interface ToggleChecklistItemInput {
  tripId: string;
  itemId: string;
  uid: string;
  isCompleted: boolean;
}

export const toggleChecklistItem = createAsyncThunk<
  void,
  ToggleChecklistItemInput,
  { rejectValue: string }
>(
  'waypoint/checklist/toggle',
  async ({ tripId, itemId, uid, isCompleted }) => {
    await updateDoc(
      doc(db, 'apps', 'waypoint', 'trips', tripId, 'checklist', itemId),
      {
        isCompleted,
        markedCompletedByUid: isCompleted ? uid : null,
        markedCompletedAt: isCompleted ? Date.now() : null,
        lastEditedAt: Date.now(),
      },
    );
  },
);
