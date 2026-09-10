import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { startHouseholdListener } from '../store/listeners/householdListener';
import { setHouseholds } from '../store/slices/householdsSlice';

export function useNineLivesSync(
  householdId: string | null,
  uidOverride?: string | null,
) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const activeUid = uidOverride ?? user?.uid ?? null;

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

  return useAppSelector((state) => {
    if (!householdId) {
      return null;
    }

    return (
      state.nineLives.households.items.find(
        (household) => household.id === householdId,
      ) ?? null
    );
  });
}
