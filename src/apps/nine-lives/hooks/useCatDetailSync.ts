import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startCatConditionsListener,
  startExpensesListener,
  startSymptomsListener,
} from '../store/listeners/catDetailListeners';
import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setCatConditions } from '../store/slices/catConditionsSlice';
import { setExpenses } from '../store/slices/expensesSlice';
import { setSymptoms } from '../store/slices/symptomsSlice';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

export function useCatDetailSync(householdId: string | null | undefined, catId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!householdId || !catId) {
      dispatch(setWeightEntries([]));
      dispatch(setSymptoms([]));
      dispatch(setCatConditions([]));
      dispatch(setExpenses([]));
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
    const unsubscribeExpenses = startExpensesListener(householdId, catId, (expenses) => {
      dispatch(setExpenses(expenses));
    });

    return () => {
      unsubscribeWeightEntries();
      unsubscribeSymptoms();
      unsubscribeCatConditions();
      unsubscribeExpenses();
    };
  }, [dispatch, householdId, catId]);
}
