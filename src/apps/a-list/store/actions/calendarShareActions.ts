import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { generateToken } from '@/utils/idUtils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import {
  MAX_CALENDAR_SHARES,
  MAX_SHARE_RANGE_DAYS,
  MAX_SHARED_VIEWINGS,
  SHARE_ID_LENGTH,
  SHARE_PIN_LENGTH,
} from '@apps/a-list/constants';
import type { CalendarShare, Viewing } from '@apps/a-list/types';
import {
  getRangeDayCount,
  pickSharedViewings,
  type DayKeyRange,
} from '@apps/a-list/utils/sharing';

const getSharesRef = () => collection(db, 'apps', 'a-list', 'calendarShares');
const getShareRef = (shareId: string) =>
  doc(db, 'apps', 'a-list', 'calendarShares', shareId);

const newPin = () => generateToken(SHARE_PIN_LENGTH).toUpperCase();

interface CreateCalendarShareInput {
  uid: string;
  range: DayKeyRange;
  viewings: Viewing[];
  hasPin: boolean;
}

/** Freezes the range's showings into a new share; the cap is counted on the server so a second tab can't slip past it. */
export const createCalendarShare = createAsyncThunk<
  string,
  CreateCalendarShareInput,
  { rejectValue: string }
>(
  'aList/calendarShares/create',
  async ({ uid, range, viewings, hasPin }, { rejectWithValue }) => {
    const startDate = fromDateInputValue(range.startKey);
    const endDate = fromDateInputValue(range.endKey);
    const dayCount = getRangeDayCount(range);
    if (startDate === undefined || endDate === undefined || dayCount < 1) {
      return rejectWithValue('Pick a start day that comes before the end day.');
    }
    if (dayCount > MAX_SHARE_RANGE_DAYS) {
      return rejectWithValue('A shared calendar can cover up to a year.');
    }

    const sharedViewings = pickSharedViewings(viewings, range);
    if (sharedViewings.length === 0) {
      return rejectWithValue('Nothing is planned in these dates yet.');
    }
    if (sharedViewings.length > MAX_SHARED_VIEWINGS) {
      return rejectWithValue('That is too many movies for one link. Try a shorter range.');
    }

    try {
      const existing = await getCountFromServer(
        query(getSharesRef(), where('ownerUid', '==', uid)),
      );
      if (existing.data().count >= MAX_CALENDAR_SHARES) {
        return rejectWithValue(
          `You already have ${MAX_CALENDAR_SHARES} shared calendars. Delete one to make another.`,
        );
      }

      const now = Date.now();
      const share: CalendarShare = {
        id: generateToken(SHARE_ID_LENGTH),
        ownerUid: uid,
        startDate,
        endDate,
        pin: hasPin ? newPin() : null,
        viewings: sharedViewings,
        createdAt: now,
        lastEditedAt: now,
      };
      await setDoc(getShareRef(share.id), share);
      return share.id;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to create this link. Check your connection and try again.'),
      );
    }
  },
);

interface SetCalendarSharePinInput {
  shareId: string;
  isLocked: boolean;
}

/** Locking mints a fresh PIN each time, so turning it off and on again retires the old one. */
export const setCalendarSharePin = createAsyncThunk<
  void,
  SetCalendarSharePinInput,
  { rejectValue: string }
>(
  'aList/calendarShares/setPin',
  async ({ shareId, isLocked }, { rejectWithValue }) => {
    try {
      await updateDoc(getShareRef(shareId), {
        pin: isLocked ? newPin() : null,
        lastEditedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to change this PIN.'),
      );
    }
  },
);

export const deleteCalendarShare = createAsyncThunk<
  void,
  string,
  { rejectValue: string }
>('aList/calendarShares/delete', async (shareId, { rejectWithValue }) => {
  try {
    await deleteDoc(getShareRef(shareId));
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to delete this link.'),
    );
  }
});
