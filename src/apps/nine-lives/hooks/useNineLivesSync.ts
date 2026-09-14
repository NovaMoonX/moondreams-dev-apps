import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearCurrentHouseholdData } from '@/store/utils/createOptimisticCollectionSlice';

import { startCatsListener } from '../store/listeners/catsListener';
import { startDoctorsListener } from '../store/listeners/doctorsListener';
import { startHouseholdListener } from '../store/listeners/householdListener';
import { startPendingRequestsListener } from '../store/listeners/pendingRequestsListener';
import { startVaccinationsListener } from '../store/listeners/vaccinationsListener';
import { startVetClinicsListener } from '../store/listeners/vetClinicsListener';
import { setCats } from '../store/slices/catsSlice';
import { setDoctors } from '../store/slices/doctorsSlice';
import { setHouseholds } from '../store/slices/householdsSlice';
import { setPendingRequests } from '../store/slices/pendingRequestsSlice';
import { setVaccinations } from '../store/slices/vaccinationsSlice';
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
      return;
    }

    const unsubscribe = startHouseholdListener(activeUid, (households) => {
      dispatch(setHouseholds(households));
    });

    return unsubscribe;
  }, [activeUid, dispatch]);

  // Sync the selected household's cats, clinics, doctors, and incoming requests.
  useEffect(() => {
    if (!householdId) {
      dispatch(clearCurrentHouseholdData());
      dispatch(setPendingRequests([]));
      dispatch(setVaccinations([]));
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
    const unsubscribePendingRequests = startPendingRequestsListener(
      householdId,
      (requests) => {
        dispatch(setPendingRequests(requests));
      },
    );
    const unsubscribeVaccinations = startVaccinationsListener(householdId, (vaccinations) => {
      dispatch(setVaccinations(vaccinations));
    });

    return () => {
      unsubscribeCats();
      unsubscribeVetClinics();
      unsubscribeDoctors();
      unsubscribePendingRequests();
      unsubscribeVaccinations();
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
