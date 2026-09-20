import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { LitterBox, LitterEntry } from '@apps/nine-lives/types';

import {
  removeLitterBox,
  revertLitterBox,
  upsertLitterBox,
} from '../slices/litterBoxesSlice';
import { getLatestFullChangeByBox, LITTER_OVERDUE_DAYS } from '../../utils/attentionItems';
import { cancelEntityReminders, ONE_DAY_MS, scheduleEntityReminders } from '../../utils/reminders';

const LITTER_REMINDER_LEAD_DAYS = 2;

const getLitterBoxDocRef = (householdId: string, litterBoxId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'litterBoxes', litterBoxId);

export async function syncLitterBoxReminder(
  state: RootState,
  householdId: string,
  reminderUid: string | undefined,
  litterBoxId: string,
  litterEntries: LitterEntry[],
): Promise<void> {
  const box = state.nineLives.litterBoxes.items.find((item) => item.id === litterBoxId);

  if (!box || !box.isActive) {
    return;
  }

  await cancelEntityReminders(box.reminderIds);

  const latestChangedAt = getLatestFullChangeByBox(litterEntries).get(litterBoxId);
  let reminderIds: string[] = [];

  if (latestChangedAt !== undefined && reminderUid) {
    const dueAt = latestChangedAt + LITTER_OVERDUE_DAYS * ONE_DAY_MS;
    reminderIds = await scheduleEntityReminders(state, householdId, reminderUid, [
      {
        title: 'Litter change coming up',
        body: `${box.name}'s litter will need a full change soon.`,
        scheduledFor: dueAt - LITTER_REMINDER_LEAD_DAYS * ONE_DAY_MS,
        relatedEntityPath: `apps/nine-lives/households/${householdId}/litterBoxes/${litterBoxId}`,
      },
    ]);
  }

  try {
    await updateDoc(getLitterBoxDocRef(householdId, litterBoxId), {
      reminderIds,
      lastEditedAt: Date.now(),
    });
  } catch {
    return;
  }
}

export const createLitterBox = createAsyncThunk<
  LitterBox,
  {
    householdId: string;
    uid: string;
    litterBox: Partial<LitterBox> & Pick<LitterBox, 'name'>;
  },
  { rejectValue: string }
>(
  'nineLives/litterBoxes/create',
  async ({ householdId, uid, litterBox }, { dispatch, rejectWithValue }) => {
    const trimmedName = litterBox.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Litter box name is required.');
    }

    const litterBoxId =
      litterBox.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'litterBoxes')).id;
    const now = Date.now();

    const nextLitterBox: LitterBox = {
      id: litterBoxId,
      householdId,
      name: trimmedName,
      location: litterBox.location?.trim() || null,
      isActive: litterBox.isActive ?? true,
      reminderIds: [],
      createdBy: uid,
      createdAt: litterBox.createdAt ?? now,
      lastEditedAt: now,
    };

    await setDoc(getLitterBoxDocRef(householdId, litterBoxId), nextLitterBox);
    dispatch(upsertLitterBox(nextLitterBox));

    return nextLitterBox;
  },
);

export const updateLitterBox = createAsyncThunk<
  LitterBox,
  { householdId: string; litterBoxId: string; changes: Partial<LitterBox> },
  { rejectValue: string }
>(
  'nineLives/litterBoxes/update',
  async ({ householdId, litterBoxId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litterBoxes.items.find(
      (litterBox) => litterBox.id === litterBoxId,
    );

    if (!current) {
      return rejectWithValue('Litter box not found.');
    }

    const sanitizedChanges = { ...changes };

    if (sanitizedChanges.name !== undefined) {
      sanitizedChanges.name = sanitizedChanges.name.trim() || current.name;
    }

    if (sanitizedChanges.location !== undefined) {
      sanitizedChanges.location = sanitizedChanges.location?.trim() || null;
    }

    const nextLitterBox: LitterBox = {
      ...current,
      ...sanitizedChanges,
      id: litterBoxId,
      householdId,
      lastEditedAt: Date.now(),
    };

    if (current.isActive && nextLitterBox.isActive === false) {
      await cancelEntityReminders(current.reminderIds);
      nextLitterBox.reminderIds = [];
    }

    dispatch(upsertLitterBox(nextLitterBox));

    try {
      await updateDoc(getLitterBoxDocRef(householdId, litterBoxId), {
        ...sanitizedChanges,
        reminderIds: nextLitterBox.reminderIds,
        lastEditedAt: nextLitterBox.lastEditedAt,
      });
      return nextLitterBox;
    } catch (error) {
      dispatch(revertLitterBox({ id: litterBoxId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update litter box.',
      );
    }
  },
);

export const deleteLitterBox = createAsyncThunk<
  { id: string },
  { householdId: string; litterBoxId: string },
  { rejectValue: string }
>(
  'nineLives/litterBoxes/delete',
  async ({ householdId, litterBoxId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.litterBoxes.items.find(
      (litterBox) => litterBox.id === litterBoxId,
    );

    if (!current) {
      return rejectWithValue('Litter box not found.');
    }

    dispatch(removeLitterBox({ id: litterBoxId }));

    try {
      await deleteDoc(getLitterBoxDocRef(householdId, litterBoxId));
      await cancelEntityReminders(current.reminderIds);
      return { id: litterBoxId };
    } catch (error) {
      dispatch(revertLitterBox({ id: litterBoxId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete litter box.',
      );
    }
  },
);
