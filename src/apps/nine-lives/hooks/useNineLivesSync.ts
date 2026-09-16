import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearCurrentHouseholdData } from '@/store/utils/createOptimisticCollectionSlice';

import { startConditionLibraryListener } from '../store/listeners/conditionLibraryListener';
import {
  startCatConditionsListener,
  startSymptomsListener,
} from '../store/listeners/catDetailListeners';
import { startCatsListener } from '../store/listeners/catsListener';
import { startCustomHealthRecordTypesListener } from '../store/listeners/customHealthRecordTypesListener';
import { startCustomPreventiveProductsListener } from '../store/listeners/customPreventiveProductsListener';
import { startCustomPreventiveTypesListener } from '../store/listeners/customPreventiveTypesListener';
import { startDoctorsListener } from '../store/listeners/doctorsListener';
import { startExpensesListener } from '../store/listeners/expensesListener';
import { startHealthRecordsListener } from '../store/listeners/healthRecordsListener';
import { startHouseholdListener } from '../store/listeners/householdListener';
import { startPendingRequestsListener } from '../store/listeners/pendingRequestsListener';
import { startPreventivesListener } from '../store/listeners/preventivesListener';
import { startVaccinationsListener } from '../store/listeners/vaccinationsListener';
import { startVisitsListener } from '../store/listeners/visitsListener';
import { startVetClinicsListener } from '../store/listeners/vetClinicsListener';
import { startWeightEntriesListener } from '../store/listeners/weightEntriesListener';
import { setCats } from '../store/slices/catsSlice';
import { setCatConditions } from '../store/slices/catConditionsSlice';
import { setCustomHealthRecordTypes } from '../store/slices/customHealthRecordTypesSlice';
import { setCustomPreventiveProducts } from '../store/slices/customPreventiveProductsSlice';
import { setCustomPreventiveTypes } from '../store/slices/customPreventiveTypesSlice';
import { setConditionLibrary } from '../store/slices/conditionLibrarySlice';
import { setDoctors } from '../store/slices/doctorsSlice';
import { setExpenses } from '../store/slices/expensesSlice';
import { setHealthRecords } from '../store/slices/healthRecordsSlice';
import { setHouseholds } from '../store/slices/householdsSlice';
import { setPendingRequests } from '../store/slices/pendingRequestsSlice';
import { setPreventives } from '../store/slices/preventivesSlice';
import { setSymptoms } from '../store/slices/symptomsSlice';
import { setVaccinations } from '../store/slices/vaccinationsSlice';
import { setVisits } from '../store/slices/visitsSlice';
import { setVetClinics } from '../store/slices/vetClinicsSlice';
import { setWeightEntries } from '../store/slices/weightEntriesSlice';

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

  // Sync the selected household's cats, clinics, doctors, incoming requests, and per-cat health records.
  useEffect(() => {
    if (!householdId) {
      dispatch(clearCurrentHouseholdData());
      dispatch(setPendingRequests([]));
      dispatch(setVisits([]));
      dispatch(setCustomHealthRecordTypes([]));
      dispatch(setHealthRecords([]));
      dispatch(setExpenses([]));
      dispatch(setPreventives([]));
      dispatch(setCustomPreventiveProducts([]));
      dispatch(setCustomPreventiveTypes([]));
      dispatch(setVaccinations([]));
      dispatch(setWeightEntries([]));
      dispatch(setCatConditions([]));
      dispatch(setSymptoms([]));
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
    const unsubscribePreventives = startPreventivesListener(householdId, (preventives) => {
      dispatch(setPreventives(preventives));
    });
    const unsubscribeCustomPreventiveProducts = startCustomPreventiveProductsListener(
      householdId,
      (products) => {
        dispatch(setCustomPreventiveProducts(products));
      },
    );
    const unsubscribeCustomPreventiveTypes = startCustomPreventiveTypesListener(
      householdId,
      (types) => {
        dispatch(setCustomPreventiveTypes(types));
      },
    );
    const unsubscribeVaccinations = startVaccinationsListener(householdId, (vaccinations) => {
      dispatch(setVaccinations(vaccinations));
    });
    const unsubscribeWeightEntries = startWeightEntriesListener(householdId, (weightEntries) => {
      dispatch(setWeightEntries(weightEntries));
    });
    const unsubscribeCatConditions = startCatConditionsListener(householdId, (conditions) => {
      dispatch(setCatConditions(conditions));
    });
    const unsubscribeSymptoms = startSymptomsListener(householdId, (symptoms) => {
      dispatch(setSymptoms(symptoms));
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
      unsubscribePreventives();
      unsubscribeCustomPreventiveProducts();
      unsubscribeCustomPreventiveTypes();
      unsubscribeVaccinations();
      unsubscribeWeightEntries();
      unsubscribeCatConditions();
      unsubscribeSymptoms();
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
