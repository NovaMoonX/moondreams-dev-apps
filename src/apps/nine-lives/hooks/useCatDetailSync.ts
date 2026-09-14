import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import { startCatConditionsListener } from '../store/listeners/catDetailListeners';
import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setCatConditions } from '../store/slices/catConditionsSlice';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

export function useCatDetailSync(householdId: string | null | undefined, catId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!householdId || !catId) {
      dispatch(setWeightEntries([]));
      dispatch(setCatConditions([]));
      return;
    }

    const unsubscribeWeightEntries = startWeightEntriesListener(
      householdId,
      catId,
      (weightEntries) => {
        dispatch(setWeightEntries(weightEntries));
      },
    );
    const unsubscribeCatConditions = startCatConditionsListener(
      householdId,
      catId,
      (conditions) => {
        dispatch(setCatConditions(conditions));
      },
    );

    return () => {
      unsubscribeWeightEntries();
      unsubscribeCatConditions();
    };
  }, [dispatch, householdId, catId]);
}
