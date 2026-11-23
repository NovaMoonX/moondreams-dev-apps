import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_PERSON_NAME_LENGTH } from '@apps/a-list/constants';
import type { AddedCalendar, ShareKind } from '@apps/a-list/types';
import { toPersonKey } from '@apps/a-list/utils/friendShowings';

const getAddedRef = (uid: string, shareId: string) =>
  doc(db, 'apps', 'a-list', 'memberships', uid, 'sharedCalendars', shareId);

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON_NAME_LENGTH);

interface AddSharedCalendarInput {
  uid: string;
  shareId: string;
  feedId: string;
  kind: ShareKind;
  personName: string;
  /** Names already in use by other people; adding to one of them is the caller's explicit choice (`isJoining`). */
  takenNames: string[];
  isJoining: boolean;
}

/** Puts a share on the member's calendar under the name of the person it is from. */
export const addSharedCalendar = createAsyncThunk<void, AddSharedCalendarInput, { rejectValue: string }>(
  'aList/addedCalendars/add',
  async ({ uid, shareId, feedId, kind, personName, takenNames, isJoining }, { rejectWithValue }) => {
    const name = cleanName(personName);
    if (name === '') return rejectWithValue('Add the name of the person this is from.');
    const isTaken = takenNames.some((taken) => toPersonKey(taken) === toPersonKey(name));
    if (isTaken && !isJoining) return rejectWithValue(`${name} is already on your calendar.`);

    const now = Date.now();
    const calendar: AddedCalendar = {
      id: shareId,
      feedId,
      personName: isJoining ? (takenNames.find((taken) => toPersonKey(taken) === toPersonKey(name)) ?? name) : name,
      kind,
      isShown: true,
      createdAt: now,
      lastEditedAt: now,
    };
    try {
      await setDoc(getAddedRef(uid, shareId), calendar);
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Unable to add this calendar.'));
    }
  },
);

interface RenameSharedPersonInput {
  uid: string;
  calendarIds: string[];
  personName: string;
  otherNames: string[];
}

/** Renames every link from one person at once; a name another person already has is refused. */
export const renameSharedPerson = createAsyncThunk<void, RenameSharedPersonInput, { rejectValue: string }>(
  'aList/addedCalendars/rename',
  async ({ uid, calendarIds, personName, otherNames }, { rejectWithValue }) => {
    const name = cleanName(personName);
    if (name === '') return rejectWithValue('Add a name.');
    if (otherNames.some((other) => toPersonKey(other) === toPersonKey(name))) {
      return rejectWithValue(`${name} is already on your calendar.`);
    }

    const batch = writeBatch(db);
    const now = Date.now();
    calendarIds.forEach((id) => batch.update(getAddedRef(uid, id), { personName: name, lastEditedAt: now }));
    try {
      await batch.commit();
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Unable to rename.'));
    }
  },
);

interface SetSharedPersonShownInput {
  uid: string;
  calendarIds: string[];
  isShown: boolean;
}

export const setSharedPersonShown = createAsyncThunk<void, SetSharedPersonShownInput, { rejectValue: string }>(
  'aList/addedCalendars/setShown',
  async ({ uid, calendarIds, isShown }, { rejectWithValue }) => {
    const batch = writeBatch(db);
    const now = Date.now();
    calendarIds.forEach((id) => batch.update(getAddedRef(uid, id), { isShown, lastEditedAt: now }));
    try {
      await batch.commit();
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Unable to change this.'));
    }
  },
);

export const removeSharedCalendar = createAsyncThunk<void, { uid: string; shareId: string }, { rejectValue: string }>(
  'aList/addedCalendars/remove',
  async ({ uid, shareId }, { rejectWithValue }) => {
    try {
      await deleteDoc(getAddedRef(uid, shareId));
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Unable to remove this calendar.'));
    }
  },
);
