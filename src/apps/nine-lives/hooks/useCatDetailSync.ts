import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startCatConditionsListener,
  startSymptomsListener,
} from '../store/listeners/catDetailListeners';
import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setCatConditions } from '../store/slices/catConditionsSlice';
import { setSymptoms } from '../store/slices/symptomsSlice';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

export function useCatDetailSync(householdId: string | null | undefined, catId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!householdId || !catId) {
      dispatch(setWeightEntries([]));
      dispatch(setSymptoms([]));
      dispatch(setCatConditions([]));
      return;
    }

    const unsubscribeWeightEntries = startWeightEntriesListener(householdId, catId, (weightEntries) => {
      dispatch(setWeightEntries(weightEntries));
    });
    const unsubscribeSymptoms = startSymptomsListener(householdId, catId, (symptoms) => {
      dispatch(setSymptoms(symptoms));
    });
    const unsubscribeCatConditions = startCatConditionsListener(householdId, catId, (conditions) => {
      dispatch(setCatConditions(conditions));
    });

    return () => {
      unsubscribeWeightEntries();
      unsubscribeSymptoms();
      unsubscribeCatConditions();
    };
  }, [dispatch, householdId, catId]);
}
