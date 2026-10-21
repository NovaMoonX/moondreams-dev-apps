import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { doc, FieldPath, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getStorageErrorMessage } from '@/utils/errorUtils';
import { selectHasPinchSettings } from '@apps/pinch/store/selectors';
import {
  createSettings,
  getDeviceTimeZone,
  getSettingsUpdates,
  type PinchSettingsPatch,
} from '@apps/pinch/utils/settings';

interface SavePinchSettingsInput {
  uid: string;
  patch: PinchSettingsPatch;
}

const OFFLINE_MESSAGE =
  "You're offline, so your first change can't save yet. Try again once you're back online.";

/** The path and value pairs of a change, as `updateDoc` and a transaction's `update` take them. */
const getUpdateArgs = (
  patch: PinchSettingsPatch,
  now: number,
): [FieldPath, unknown, ...unknown[]] => {
  const [first, ...rest] = getSettingsUpdates(patch, now);
  return [
    new FieldPath(...first.path),
    first.value,
    ...rest.flatMap(({ path, value }) => [new FieldPath(...path), value]),
  ];
};

/** Once the document is known, a change writes only its own fields by dotted path without waiting on the server. The first change is a transaction that reads the server, so a device that was offline while another created the document never replaces what that one chose; offline it says so instead of queueing. */
export const savePinchSettings = createAsyncThunk<
  void,
  SavePinchSettingsInput,
  { rejectValue: string }
>(
  'pinch/pinchSettings/save',
  async ({ uid, patch }, { getState, rejectWithValue }) => {
    try {
      const ref = doc(db, 'apps', 'pinch', 'settings', uid);
      const now = Date.now();
      const exists = selectHasPinchSettings(
        getState() as Parameters<typeof selectHasPinchSettings>[0],
      );
      if (exists) {
        const [field, value, ...more] = getUpdateArgs(patch, now);
        await updateDoc(ref, field, value, ...more);
        return;
      }
      if (!navigator.onLine) return rejectWithValue(OFFLINE_MESSAGE);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) {
          transaction.set(ref, createSettings(patch, now, getDeviceTimeZone()));
          return;
        }
        const [field, value, ...more] = getUpdateArgs(patch, now);
        transaction.update(ref, field, value, ...more);
      });
    } catch (error) {
      if (
        error instanceof FirebaseError &&
        (error.code === 'unavailable' || !navigator.onLine)
      ) {
        return rejectWithValue(OFFLINE_MESSAGE);
      }
      return rejectWithValue(
        getStorageErrorMessage(error, 'Unable to save your settings.'),
      );
    }
  },
);

/** Writes the defaults as a person's settings the first time Pinch opens with none, so the morning note, which finds people by a stored switch, reaches them. The transaction reads the server first, so it never replaces a document another device made. Best effort: offline or refused, the defaults still stand on screen and the next open tries again. */
export const ensurePinchSettings = createAsyncThunk<void, string>(
  'pinch/pinchSettings/ensure',
  async (uid) => {
    if (!navigator.onLine) return;
    try {
      const ref = doc(db, 'apps', 'pinch', 'settings', uid);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists()) return;
        transaction.set(
          ref,
          createSettings({}, Date.now(), getDeviceTimeZone()),
        );
      });
    } catch (error) {
      console.error('Pinch settings were not created', error);
    }
  },
);
