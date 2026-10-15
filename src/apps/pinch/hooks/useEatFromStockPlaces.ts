import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import { CONTAINER_PLACES } from '@apps/pinch/constants';
import { selectContainers } from '@apps/pinch/store/selectors';
import type { PlannedMeal } from '@apps/pinch/types';

export const useMealContainers = (meal: PlannedMeal | null) => {
  const containers = useAppSelector(selectContainers);
  return useMemo(
    () =>
      meal === null
        ? []
        : containers.filter(
            (container) =>
              (container.recipeId !== null &&
                meal.items.some(
                  (item) =>
                    item.kind === 'RECIPE' && item.refId === container.recipeId,
                )) ||
              (container.mealId !== null &&
                container.mealId === meal.sourceMealId),
          ),
    [containers, meal],
  );
};

/** The places that hold a container matching the meal, with how many; empty while nothing matches. */
export const useEatFromStockPlaces = (meal: PlannedMeal | null) => {
  const candidates = useMealContainers(meal);
  return useMemo(
    () =>
      CONTAINER_PLACES.map((place) => ({
        place,
        count: candidates.filter((container) => container.place === place)
          .length,
      })).filter((entry) => entry.count > 0),
    [candidates],
  );
};
