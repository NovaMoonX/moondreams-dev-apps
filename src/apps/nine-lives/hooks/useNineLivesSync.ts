import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearCurrentHouseholdData } from '@/store/utils/createOptimisticCollectionSlice';

import { startConditionLibraryListener } from '../store/listeners/conditionLibraryListener';
import { startCatsListener } from '../store/listeners/catsListener';
import { startCustomHealthRecordTypesListener } from '../store/listeners/customHealthRecordTypesListener';
import { startDoctorsListener } from '../store/listeners/doctorsListener';
import { startExpensesListener } from '../store/listeners/expensesListener';
import { startHealthRecordsListener } from '../store/listeners/healthRecordsListener';
import { startHouseholdListener } from '../store/listeners/householdListener';
import { startPendingRequestsListener } from '../store/listeners/pendingRequestsListener';
import { startVisitsListener } from '../store/listeners/visitsListener';
import { startVetClinicsListener } from '../store/listeners/vetClinicsListener';
import { setCats } from '../store/slices/catsSlice';
import { setCustomHealthRecordTypes } from '../store/slices/customHealthRecordTypesSlice';
import { setConditionLibrary } from '../store/slices/conditionLibrarySlice';
import { setDoctors } from '../store/slices/doctorsSlice';
import { setExpenses } from '../store/slices/expensesSlice';
import { setHealthRecords } from '../store/slices/healthRecordsSlice';
import { setHouseholds } from '../store/slices/householdsSlice';
import { setPendingRequests } from '../store/slices/pendingRequestsSlice';
import { setVisits } from '../store/slices/visitsSlice';
import { setVetClinics } from '../store/slices/vetClinicsSlice';

export function useNineLivesSync(
  householdId: string | null,
  uidOverride?: string | null,
) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const activeUid = uidOverride ?? user?.uid ?? null;

  // Sync the signed-in user's households so the current household can be discovered.
  useEffect(() => {
    if (!activeUid) {
      dispatch(setHouseholds([]));
      dispatch(setConditionLibrary([]));
      return;
    }

    const unsubscribeHouseholds = startHouseholdListener(activeUid, (households) => {
      dispatch(setHouseholds(households));
    });
    const unsubscribeConditionLibrary = startConditionLibraryListener((conditions) => {
      dispatch(setConditionLibrary(conditions));
    });

    return () => {
      unsubscribeHouseholds();
      unsubscribeConditionLibrary();
    };
  }, [activeUid, dispatch]);

  // Sync the selected household's cats, clinics, doctors, and incoming requests.
  useEffect(() => {
    if (!householdId) {
      dispatch(clearCurrentHouseholdData());
      dispatch(setPendingRequests([]));
      dispatch(setVisits([]));
      dispatch(setCustomHealthRecordTypes([]));
      dispatch(setHealthRecords([]));
      dispatch(setExpenses([]));
      return;
    }

    const unsubscribeCats = startCatsListener(householdId, (cats) => {
      dispatch(setCats(cats));
    });
    const unsubscribeVetClinics = startVetClinicsListener(householdId, (vetClinics) => {
      dispatch(setVetClinics(vetClinics));
    });
    const unsubscribeDoctors = startDoctorsListener(householdId, (doctors) => {
      dispatch(setDoctors(doctors));
    });
    const unsubscribeCustomHealthRecordTypes = startCustomHealthRecordTypesListener(
      householdId,
      (types) => {
        dispatch(setCustomHealthRecordTypes(types));
      },
    );
    const unsubscribePendingRequests = startPendingRequestsListener(
      householdId,
      (requests) => {
        dispatch(setPendingRequests(requests));
      },
    );
    const unsubscribeVisits = startVisitsListener(householdId, (visits) => {
      dispatch(setVisits(visits));
    });
    const unsubscribeExpenses = startExpensesListener(householdId, (expenses) => {
      dispatch(setExpenses(expenses));
    });
    const unsubscribeHealthRecords = startHealthRecordsListener(householdId, (records) => {
      dispatch(setHealthRecords(records));
    });

    return () => {
      unsubscribeCats();
      unsubscribeVetClinics();
      unsubscribeDoctors();
      unsubscribeCustomHealthRecordTypes();
      unsubscribePendingRequests();
      unsubscribeVisits();
      unsubscribeExpenses();
      unsubscribeHealthRecords();
    };
  }, [dispatch, householdId]);

  return useAppSelector((state) => {
    if (!householdId) {
      return null;
    }

    const household = state.nineLives.households.items.find(
      (item) => item.id === householdId,
    );

    return household ?? null;
  });
}
