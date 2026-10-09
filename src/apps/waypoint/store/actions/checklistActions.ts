import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  ChecklistCategory,
  ChecklistItem,
  ExpenseLink,
  TripSpace,
} from '@apps/waypoint/types';
import { PLAN_COLLECTIONS } from '@apps/waypoint/constants';
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
  /** The event, stay or rental this is a to-do for; ignored for a private item, which can't be linked. */
  linkedTo?: ExpenseLink | null;
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
      linkedTo = null,
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
      linkedTo: isPrivate ? null : linkedTo,
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

interface LinkChecklistItemsInput {
  tripId: string;
  itemIds: string[];
  link: ExpenseLink;
}

/** Links shared items to a plan, aborting if someone linked one elsewhere meanwhile; a link to a deleted plan counts as free. */
export const linkChecklistItems = createAsyncThunk<void, LinkChecklistItemsInput>(
  'waypoint/checklist/link',
  async ({ tripId, itemIds, link }) => {
    await runTransaction(db, async (transaction) => {
      const itemRefs = itemIds.map((itemId) => doc(CHECKLIST_COLLECTION(tripId), itemId));
      const snapshots = await Promise.all(itemRefs.map((itemRef) => transaction.get(itemRef)));
      const currentLinks = snapshots.map((snapshot) => {
        if (!snapshot.exists()) {
          throw new Error('One of those to-dos was removed.');
        }
        return (snapshot.data() as Partial<ChecklistItem>).linkedTo ?? null;
      });
      const targets = await Promise.all(
        currentLinks.map((current) =>
          current && (current.kind !== link.kind || current.id !== link.id)
            ? transaction.get(doc(db, 'apps', 'waypoint', 'trips', tripId, PLAN_COLLECTIONS[current.kind], current.id))
            : null,
        ),
      );
      if (targets.some((target) => target?.exists())) {
        throw new Error('One of those to-dos was just linked to something else.');
      }
      const lastEditedAt = Date.now();
      itemRefs.forEach((itemRef) => transaction.update(itemRef, { linkedTo: link, lastEditedAt }));
    });
  },
);

/** Unlinks only the to-dos still linked to this plan, so a link someone just moved elsewhere is left alone. */
export const unlinkChecklistItems = createAsyncThunk<void, { tripId: string; itemIds: string[]; link: ExpenseLink }>(
  'waypoint/checklist/unlink',
  async ({ tripId, itemIds, link }) => {
    await runTransaction(db, async (transaction) => {
      const itemRefs = itemIds.map((itemId) => doc(CHECKLIST_COLLECTION(tripId), itemId));
      const snapshots = await Promise.all(itemRefs.map((itemRef) => transaction.get(itemRef)));
      const lastEditedAt = Date.now();
      snapshots.forEach((snapshot, index) => {
        const current = snapshot.exists() ? ((snapshot.data() as Partial<ChecklistItem>).linkedTo ?? null) : null;
        if (current && current.kind === link.kind && current.id === link.id) {
          transaction.update(itemRefs[index], { linkedTo: null, lastEditedAt });
        }
      });
    });
  },
);

interface SyncEventBookingsInput {
  tripId: string;
  eventId: string;
  /** Every to-do that should end up linked to the event. */
  picked: string[];
  /** The ones that were linked when the form opened; only these can be unlinked, so a link added meanwhile survives. */
  initial: string[];
}

/** Makes an event's linked to-dos the picked ones. Link and unlink are tried separately; `message` is set when either failed. */
export const syncEventBookings = createAsyncThunk<{ linked: boolean; message: string | null }, SyncEventBookingsInput>(
  'waypoint/checklist/syncBookings',
  async ({ tripId, eventId, picked, initial }, { dispatch }) => {
    const link: ExpenseLink = { kind: 'EVENT', id: eventId };
    const toLink = picked.filter((itemId) => !initial.includes(itemId));
    const toUnlink = initial.filter((itemId) => !picked.includes(itemId));
    const attempt = async (action: () => Promise<unknown>, shouldRun: boolean) => {
      if (!shouldRun) {
        return null;
      }
      try {
        await action();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Please try again.';
      }
    };
    const linkMessage = await attempt(
      () => dispatch(linkChecklistItems({ tripId, itemIds: toLink, link })).unwrap(),
      toLink.length > 0,
    );
    const unlinkMessage = await attempt(
      () => dispatch(unlinkChecklistItems({ tripId, itemIds: toUnlink, link })).unwrap(),
      toUnlink.length > 0,
    );
    return { linked: picked.length > 0 && linkMessage === null, message: linkMessage ?? unlinkMessage };
  },
);
