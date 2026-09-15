import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startCatConditionsListener,
  startHealthRecordsListener,
  startSymptomsListener,
} from '../store/listeners/catDetailListeners';
import { setHealthRecords } from '../store/slices/healthRecordsSlice';
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
      dispatch(setHealthRecords([]));
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
    const unsubscribeHealthRecords = startHealthRecordsListener(householdId, catId, (records) => {
      dispatch(setHealthRecords(records));
    });

    return () => {
      unsubscribeWeightEntries();
      unsubscribeSymptoms();
      unsubscribeCatConditions();
      unsubscribeHealthRecords();
    };
  }, [dispatch, householdId, catId]);
}
