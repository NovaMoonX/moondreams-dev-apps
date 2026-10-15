import { useMemo } from 'react';

import { useAppSelector } from '@/store';
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
