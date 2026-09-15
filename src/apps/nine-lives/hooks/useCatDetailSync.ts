import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startCatConditionsListener,
  startSymptomsListener,
} from '../store/listeners/catDetailListeners';
import { startVaccinationsListener } from '../store/listeners/vaccinationsListener';
import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setCatConditions } from '../store/slices/catConditionsSlice';
import { setSymptoms } from '../store/slices/symptomsSlice';
import { setVaccinations } from '../store/slices/vaccinationsSlice';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

export function useCatDetailSync(householdId: string | null | undefined, catId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!householdId || !catId) {
      dispatch(setWeightEntries([]));
      dispatch(setSymptoms([]));
      dispatch(setCatConditions([]));
      dispatch(setVaccinations([]));
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
    const unsubscribeVaccinations = startVaccinationsListener(householdId, catId, (vaccinations) => {
      dispatch(setVaccinations(vaccinations));
    });

    return () => {
      unsubscribeWeightEntries();
      unsubscribeSymptoms();
      unsubscribeCatConditions();
      unsubscribeVaccinations();
    };
  }, [dispatch, householdId, catId]);
}
