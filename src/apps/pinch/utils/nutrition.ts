import type { NutritionValues } from '@apps/pinch/types';

export const hasNutrition = (values: NutritionValues) =>
  Object.values(values).some((value) => value !== null);
