import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, FieldPath, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_DISMISSED_NUDGES } from '@apps/pinch/constants';
import type { KitchenSettings, NutritionSwitches } from '@apps/pinch/types';

export const NO_NUTRITION_SHOWN: NutritionSwitches = {
  calories: false,
  protein: false,
  carbs: false,
  fat: false,
};

interface DismissNudgeInput {
  uid: string;
  keys: string[];
}

/** Closes a nudge for the ingredients behind `keys`; the first one creates the kitchen document. */
export const dismissNudge = createAsyncThunk<
  void,
  DismissNudgeInput,
  { rejectValue: string }
>('pinch/settings/dismissNudge', async ({ uid, keys }, { rejectWithValue }) => {
  try {
    const ref = doc(db, 'apps', 'pinch', 'kitchens', uid);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const now = Date.now();
      const existing = snapshot.exists()
        ? ((snapshot.data() as KitchenSettings).dismissedNudges ?? {})
        : {};
      const added = keys.filter((key) => !(key in existing));
      if (Object.keys(existing).length + added.length > MAX_DISMISSED_NUDGES) {
        throw new Error('Too many closed nudges to remember another.');
      }

      if (!snapshot.exists()) {
        const settings: KitchenSettings = {
          uid,
          showNutrition: NO_NUTRITION_SHOWN,
          dismissedNudges: Object.fromEntries(keys.map((key) => [key, now])),
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
        ...added.flatMap((key) => [new FieldPath('dismissedNudges', key), now]),
      );
    });
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to close this nudge.'),
    );
  }
});

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
