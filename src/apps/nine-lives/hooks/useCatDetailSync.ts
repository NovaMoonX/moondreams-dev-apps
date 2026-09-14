import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import { startSymptomsListener } from '../store/listeners/catDetailListeners';
import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setSymptoms } from '../store/slices/symptomsSlice';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

export function useCatDetailSync(householdId: string | null | undefined, catId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!householdId || !catId) {
      dispatch(setWeightEntries([]));
      dispatch(setSymptoms([]));
      return;
    }

    const unsubscribeWeightEntries = startWeightEntriesListener(householdId, catId, (weightEntries) => {
      dispatch(setWeightEntries(weightEntries));
    });
    const unsubscribeSymptoms = startSymptomsListener(householdId, catId, (symptoms) => {
      dispatch(setSymptoms(symptoms));
    });

    return () => {
      unsubscribeWeightEntries();
      unsubscribeSymptoms();
    };
  }, [dispatch, householdId, catId]);
}
