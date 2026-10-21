import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, FieldPath, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getStorageErrorMessage } from '@/utils/errorUtils';
import { selectHasPinchSettings } from '@apps/pinch/store/selectors';
import {
  createSettings,
  getSettingsUpdates,
  type PinchSettingsPatch,
} from '@apps/pinch/utils/settings';

interface SavePinchSettingsInput {
  uid: string;
  patch: PinchSettingsPatch;
}

/** The first change writes the whole document with the defaults filled in; later ones write only their own fields by dotted path, so a change on another device to a field this one didn't touch survives. Neither waits on the server, so a switch works where the signal drops. */
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
      if (!exists) {
        await setDoc(ref, createSettings(patch, now));
        return;
      }
      const [first, ...rest] = getSettingsUpdates(patch, now);
      await updateDoc(
        ref,
        new FieldPath(...first.path),
        first.value,
        ...rest.flatMap(({ path, value }) => [new FieldPath(...path), value]),
      );
    } catch (error) {
      return rejectWithValue(
        getStorageErrorMessage(error, 'Unable to save your settings.'),
      );
    }
  },
);
