import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, FieldPath, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
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

/** Switches individual nutrition metrics on or off with dotted-path writes, so a concurrent change to another metric or a dismissal survives; the first change creates the kitchen document. */
export const saveSettings = createAsyncThunk<
  void,
  SaveSettingsInput,
  { rejectValue: string }
>(
  'pinch/settings/save',
  async ({ uid, showNutrition }, { rejectWithValue }) => {
    try {
      const ref = doc(db, 'apps', 'pinch', 'kitchens', uid);
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

        transaction.update(
          ref,
          'updatedAt',
          now,
          ...Object.entries(showNutrition).flatMap(([metric, isOn]) => [
            new FieldPath('showNutrition', metric),
            isOn,
          ]),
        );
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save your settings.'),
      );
    }
  },
);
