import { useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { freezePastMeals } from '@apps/pinch/store/actions/freezeActions';
import {
  selectIsPinchLoaded,
  selectPlannedMeals,
} from '@apps/pinch/store/selectors';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';

/** Freezes the loaded past meals once the kitchen has loaded, and again whenever a newly loaded month brings unfrozen ones; a failed attempt isn't retried until that set changes. */
export function useFreezePastDays(uid: string | null) {
  const dispatch = useAppDispatch();
  const isLoaded = useAppSelector(selectIsPinchLoaded);
  const dueKey = useAppSelector((state) => {
    const today = getLocalTodayDate();
    return selectPlannedMeals(state)
      .filter((meal) => meal.snapshot === null && meal.date < today)
      .map((meal) => meal.id)
      .sort()
      .join(',');
  });
  const attempted = useRef('');

  useEffect(() => {
    if (!uid || !isLoaded || dueKey === '' || attempted.current === dueKey) {
      return;
    }

    attempted.current = dueKey;
    void dispatch(freezePastMeals({ uid }));
  }, [dispatch, dueKey, isLoaded, uid]);
}
