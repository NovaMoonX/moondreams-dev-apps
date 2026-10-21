import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { doc, FieldPath, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getStorageErrorMessage } from '@/utils/errorUtils';
import { selectHasKitchenSettings } from '@apps/pinch/store/selectors';
import type { KitchenSettings, NutritionSwitches } from '@apps/pinch/types';

export const NO_NUTRITION_SHOWN: NutritionSwitches = {
  calories: false,
  protein: false,
  carbs: false,
  fat: false,
};

interface SaveSettingsInput {
  uid: string;
  showNutrition: Partial<NutritionSwitches>;
}

const OFFLINE_MESSAGE =
  "You're offline, so your first change can't save yet. Try again once you're back online.";

/** Once the document is known, a change writes only its own fields by dotted path, so it shows at once from the local write and works offline. The first change is a transaction that reads the server, so a device that was offline while another created the document never replaces what that one chose; offline it says so instead of queueing. */
export const saveSettings = createAsyncThunk<
  void,
  SaveSettingsInput,
  { rejectValue: string }
>(
  'pinch/settings/save',
  async ({ uid, showNutrition }, { getState, rejectWithValue }) => {
    try {
      const ref = doc(db, 'apps', 'pinch', 'kitchens', uid);
      const changes = Object.entries(showNutrition).flatMap(
        ([metric, isOn]) => [new FieldPath('showNutrition', metric), isOn],
      );
      if (
        selectHasKitchenSettings(
          getState() as Parameters<typeof selectHasKitchenSettings>[0],
        )
      ) {
        await updateDoc(ref, 'updatedAt', Date.now(), ...changes);
        return;
      }
      if (!navigator.onLine) return rejectWithValue(OFFLINE_MESSAGE);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const now = Date.now();

        if (!snapshot.exists()) {
          const settings: KitchenSettings = {
            uid,
            showNutrition: { ...NO_NUTRITION_SHOWN, ...showNutrition },
            dismissedNudges: {},
            createdAt: now,
            updatedAt: now,
          };
          transaction.set(ref, settings);
          return;
        }

        transaction.update(ref, 'updatedAt', now, ...changes);
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
