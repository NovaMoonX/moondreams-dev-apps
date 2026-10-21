import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, FieldPath, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_DISMISSED_NUDGES } from '@apps/pinch/constants';
import type { KitchenSettings } from '@apps/pinch/types';

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
          showNutrition: {
            calories: false,
            protein: false,
            carbs: false,
            fat: false,
          },
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
