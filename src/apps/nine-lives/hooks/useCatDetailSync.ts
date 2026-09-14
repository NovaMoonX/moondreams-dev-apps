import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

export function useCatDetailSync(householdId: string | null | undefined, catId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!householdId || !catId) {
      dispatch(setWeightEntries([]));
      return;
    }

    const unsubscribe = startWeightEntriesListener(householdId, catId, (weightEntries) => {
      dispatch(setWeightEntries(weightEntries));
    });

    return unsubscribe;
  }, [dispatch, householdId, catId]);
}
