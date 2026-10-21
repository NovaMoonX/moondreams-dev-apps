import { useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { freezePastMeals } from '@apps/pinch/store/actions/freezeActions';
import {
  selectIsPinchLoaded,
  selectPinchLoadError,
  selectPlannedMeals,
} from '@apps/pinch/store/selectors';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';

/** Freezes the loaded past meals once the kitchen has loaded, and again for any a newly loaded month brings. Each meal is submitted once per visit: the list of unfrozen meals shrinks as the writes land, and that must never start another freeze of the same ones. */
export function useFreezePastDays(uid: string | null) {
  const dispatch = useAppDispatch();
  const isLoaded = useAppSelector(selectIsPinchLoaded);
  const hasLoadError = useAppSelector(selectPinchLoadError) !== null;
  const dueKey = useAppSelector((state) => {
    const today = getLocalTodayDate();
    return selectPlannedMeals(state)
      .filter((meal) => meal.snapshot === null && meal.date < today)
      .map((meal) => meal.id)
      .sort()
      .join(',');
  });
  const submitted = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) {
      submitted.current.clear();
      return;
    }

    if (!isLoaded || hasLoadError || dueKey === '') {
      return;
    }

    const fresh = dueKey.split(',').filter((id) => !submitted.current.has(id));
    if (fresh.length === 0) {
      return;
    }

    fresh.forEach((id) => submitted.current.add(id));
    void dispatch(freezePastMeals({ uid, onlyIds: new Set(fresh) }));
  }, [dispatch, dueKey, hasLoadError, isLoaded, uid]);
}
