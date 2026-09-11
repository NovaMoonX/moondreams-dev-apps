import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { startDoctorsListener } from '../store/listeners/doctorsListener';
import { startHouseholdListener } from '../store/listeners/householdListener';
import { startVetClinicsListener } from '../store/listeners/vetClinicsListener';
import { setDoctors } from '../store/slices/doctorsSlice';
import { setHouseholds } from '../store/slices/householdsSlice';
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

  // Sync the selected household's clinics and doctors for the active view.
  useEffect(() => {
    if (!householdId) {
      dispatch(setVetClinics([]));
      dispatch(setDoctors([]));
      return;
    }

    const unsubscribeVetClinics = startVetClinicsListener(householdId, (vetClinics) => {
      dispatch(setVetClinics(vetClinics));
    });
    const unsubscribeDoctors = startDoctorsListener(householdId, (doctors) => {
      dispatch(setDoctors(doctors));
    });

    return () => {
      unsubscribeVetClinics();
      unsubscribeDoctors();
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
