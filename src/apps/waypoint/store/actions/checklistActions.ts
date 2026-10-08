import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  ChecklistCategory,
  ChecklistItem,
  TripSpace,
} from '@apps/waypoint/types';
import { canEditExistingItem } from '@apps/waypoint/utils/roleGuards';

const CHECKLIST_COLLECTION = (tripId: string) =>
  collection(db, 'apps', 'waypoint', 'trips', tripId, 'checklist');

const getItemRef = (tripId: string, uid: string, itemId: string, isPrivate: boolean) =>
  isPrivate
    ? doc(db, 'apps', 'waypoint', 'personalChecklist', uid, 'items', itemId)
    : doc(db, 'apps', 'waypoint', 'trips', tripId, 'checklist', itemId);

interface CreateChecklistItemInput {
  tripId: string;
  uid: string;
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null;
  note: string | null;
  completeByDayIndex: number | null;
  assignedToUids: string[];
  /** Kept under the member's own uid: no one else sees it, and Overview never lists it. */
  isPrivate: boolean;
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
      note,
      completeByDayIndex,
      assignedToUids,
      isPrivate,
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
    const itemRef = isPrivate
      ? doc(collection(db, 'apps', 'waypoint', 'personalChecklist', uid, 'items'))
      : doc(CHECKLIST_COLLECTION(tripId));
    const item: ChecklistItem = {
      id: itemRef.id,
      tripId,
      title: trimmedTitle,
      category,
      customCategoryLabel: category === 'OTHER' ? trimmedCustomLabel : null,
      note: note?.trim() || null,
      completeByDayIndex,
      assignedToUids: isPrivate ? [] : [...new Set(assignedToUids)],
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
  isPrivate: boolean;
}

interface UpdateChecklistItemInput {
  trip: TripSpace;
  uid: string;
  itemId: string;
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null;
  note: string | null;
  completeByDayIndex: number | null;
  assignedToUids: string[];
  isPrivate: boolean;
}

export const updateChecklistItem = createAsyncThunk<
  void,
  UpdateChecklistItemInput,
  { rejectValue: string }
>(
  'waypoint/checklist/update',
  async (
    {
      trip,
      uid,
      itemId,
      title,
      category,
      customCategoryLabel,
      note,
      completeByDayIndex,
      assignedToUids,
      isPrivate,
    },
    { rejectWithValue },
  ) => {
    if (!isPrivate && !canEditExistingItem(trip, uid)) {
      return rejectWithValue('You do not have permission to edit checklist items.');
    }
    const trimmedTitle = title.trim();
    const trimmedCustomLabel = customCategoryLabel?.trim() || null;

    if (!trimmedTitle) {
      return rejectWithValue('Checklist title is required.');
    }
    if (category === 'OTHER' && !trimmedCustomLabel) {
      return rejectWithValue('Enter a label for the custom category.');
    }

    await updateDoc(
      getItemRef(trip.id, uid, itemId, isPrivate),
      {
        title: trimmedTitle,
        category,
        customCategoryLabel: category === 'OTHER' ? trimmedCustomLabel : null,
        note: note?.trim() || null,
        completeByDayIndex,
        assignedToUids: isPrivate ? [] : [...new Set(assignedToUids)],
        lastEditedAt: Date.now(),
      },
    );
  },
);

interface DeleteChecklistItemInput {
  trip: TripSpace;
  uid: string;
  itemId: string;
  isPrivate: boolean;
}

export const deleteChecklistItem = createAsyncThunk<
  void,
  DeleteChecklistItemInput,
  { rejectValue: string }
>(
  'waypoint/checklist/delete',
  async ({ trip, uid, itemId, isPrivate }, { rejectWithValue }) => {
    if (!isPrivate && !canEditExistingItem(trip, uid)) {
      return rejectWithValue('You do not have permission to delete checklist items.');
    }
    await deleteDoc(getItemRef(trip.id, uid, itemId, isPrivate));
  },
);

export const toggleChecklistItem = createAsyncThunk<
  void,
  ToggleChecklistItemInput,
  { rejectValue: string }
>(
  'waypoint/checklist/toggle',
  async ({ tripId, itemId, uid, isCompleted, isPrivate }) => {
    await updateDoc(
      getItemRef(tripId, uid, itemId, isPrivate),
      {
        isCompleted,
        markedCompletedByUid: isCompleted ? uid : null,
        markedCompletedAt: isCompleted ? Date.now() : null,
        lastEditedAt: Date.now(),
      },
    );
  },
);
