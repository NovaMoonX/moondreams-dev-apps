import { useCallback, useEffect, useRef } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { setMealFavorite } from '@apps/pinch/store/actions/mealActions';
import type { Meal } from '@apps/pinch/types';
import { isStarred, shouldIgnoreStarTap } from '@apps/pinch/utils/favorites';

export function useMealFavorite(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const pending = useRef(new Map<string, boolean>());
  const toast = useRef(addToast);
  useEffect(() => {
    toast.current = addToast;
  });

  const toggle = useCallback(
    (meal: Pick<Meal, 'id' | 'name' | 'isFavorite'>) => {
      const shown = isStarred(meal);
      if (shouldIgnoreStarTap(pending.current.get(meal.id) ?? null, shown)) {
        return;
      }
      const next = !shown;
      pending.current.set(meal.id, next);
      dispatch(setMealFavorite({ uid, id: meal.id, isFavorite: next }))
        .unwrap()
        .catch((error: unknown) =>
          toast.current({
            title: next
              ? `Couldn't star ${meal.name}`
              : `Couldn't take the star off ${meal.name}`,
            description: getErrorMessage(error, 'Try again in a moment.'),
            type: 'error',
          }),
        )
        .finally(() => {
          if (pending.current.get(meal.id) === next) {
            pending.current.delete(meal.id);
          }
        });
    },
    [dispatch, uid],
  );

  return toggle;
}
