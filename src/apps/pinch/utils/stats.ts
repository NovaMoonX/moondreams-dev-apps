import { MEAL_TYPES, NUTRITION_METRICS } from '@apps/pinch/constants';
import type {
  Gap,
  MealType,
  NutritionValues,
  PlannedMeal,
} from '@apps/pinch/types';
import { getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import {
  getPlannedMealCost,
  type CostContext,
} from '@apps/pinch/utils/mealMath';
import {
  getPlannedMealNutrition,
  type IngredientMissing,
} from '@apps/pinch/utils/nutritionMath';

export interface Totals {
  /** Unrounded cents of what could be priced; null when nothing was. */
  totalCents: number | null;
  count: number;
  leftOut: Gap[];
  /** Per metric, summed over the meals that know it; null when none does. */
  nutrition: NutritionValues;
}

export interface MonthStats {
  spendCents: number;
  plannedCount: number;
  /** Planned meals with at least one priced item: the average's divisor. */
  mealsPriced: number;
  avgPerMealCents: number | null;
  leftOut: Gap[];
  /** What only the meals that aren't frozen yet leave out: the part a new price can still change, and so the part worth a nudge. */
  openLeftOut: Gap[];
  /** Per metric, the average over the days that know it, so a day with nothing known never pulls it toward zero; null when no day does. */
  dailyNutrition: NutritionValues;
  /** Spend over protein grams, for the meals where both are known. */
  proteinCentsPerGram: number | null;
  nutritionMissing: IngredientMissing[];
  openNutritionMissing: IngredientMissing[];
  byDay: (Totals & { dayKey: string })[];
  byType: (Totals & { mealType: MealType })[];
}

const addNutrition = (
  a: NutritionValues | undefined,
  b: NutritionValues,
): NutritionValues =>
  Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      a?.[metric] == null && b[metric] === null
        ? null
        : (a?.[metric] ?? 0) + (b[metric] ?? 0),
    ]),
  ) as unknown as NutritionValues;

const addTotals = (
  current: Totals | undefined,
  totalCents: number | null,
  leftOut: Gap[],
  nutrition: NutritionValues,
): Totals => ({
  totalCents:
    current?.totalCents == null && totalCents === null
      ? null
      : (current?.totalCents ?? 0) + (totalCents ?? 0),
  count: (current?.count ?? 0) + 1,
  leftOut: [...(current?.leftOut ?? []), ...leftOut],
  nutrition: addNutrition(current?.nutrition, nutrition),
});

const knownDays = (byDay: Map<string, Totals>, metric: keyof NutritionValues) =>
  [...byDay.values()].filter((totals) => totals.nutrition[metric] !== null)
    .length;

const dedupe = (gaps: Gap[]) => [
  ...new Map(
    gaps.map((gap) => [`${gap.kind}:${gap.ingredientId}`, gap]),
  ).values(),
];

/** One walk over the planned meals of a month: the spend, the average per meal, the nutrition averages and the totals by day and by meal type. */
export function getMonthStats(
  plannedMeals: PlannedMeal[],
  monthKey: string,
  context: CostContext,
): MonthStats {
  const walked = plannedMeals.reduce(
    (acc, meal) => {
      const dayKey = getPlannedDayKey(meal.date);
      if (dayKey.slice(0, 7) !== monthKey) {
        return acc;
      }

      const cost = getPlannedMealCost(meal, context);
      const nutrition = getPlannedMealNutrition(
        meal,
        context.recipeNutrition,
        context.ingredientsById,
      );
      acc.byDay.set(
        dayKey,
        addTotals(
          acc.byDay.get(dayKey),
          cost.totalCents,
          cost.leftOut,
          nutrition.values,
        ),
      );
      acc.byType.set(
        meal.mealType,
        addTotals(
          acc.byType.get(meal.mealType),
          cost.totalCents,
          cost.leftOut,
          nutrition.values,
        ),
      );
      acc.nutrition = addNutrition(acc.nutrition, nutrition.values);
      acc.nutritionMissing.push(...nutrition.missing);
      if (!meal.snapshot) {
        acc.openLeftOut.push(...cost.leftOut);
        acc.openNutritionMissing.push(...nutrition.missing);
      }
      acc.plannedCount += 1;
      acc.leftOut.push(...cost.leftOut);
      if (cost.totalCents !== null) {
        acc.spendCents += cost.totalCents;
        acc.mealsPriced += 1;
        if (nutrition.values.protein !== null && nutrition.values.protein > 0) {
          acc.proteinSpendCents += cost.totalCents;
          acc.proteinGrams += nutrition.values.protein;
        }
      }
      return acc;
    },
    {
      byDay: new Map<string, Totals>(),
      byType: new Map<MealType, Totals>(),
      plannedCount: 0,
      spendCents: 0,
      mealsPriced: 0,
      leftOut: [] as Gap[],
      nutrition: undefined as NutritionValues | undefined,
      nutritionMissing: [] as IngredientMissing[],
      openLeftOut: [] as Gap[],
      openNutritionMissing: [] as IngredientMissing[],
      proteinSpendCents: 0,
      proteinGrams: 0,
    },
  );

  return {
    spendCents: walked.spendCents,
    plannedCount: walked.plannedCount,
    mealsPriced: walked.mealsPriced,
    avgPerMealCents:
      walked.mealsPriced === 0 ? null : walked.spendCents / walked.mealsPriced,
    leftOut: dedupe(walked.leftOut),
    openLeftOut: dedupe(walked.openLeftOut),
    dailyNutrition: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [
        metric,
        walked.nutrition?.[metric] == null ||
        knownDays(walked.byDay, metric) === 0
          ? null
          : walked.nutrition[metric] / knownDays(walked.byDay, metric),
      ]),
    ) as unknown as NutritionValues,
    proteinCentsPerGram:
      walked.proteinGrams === 0
        ? null
        : walked.proteinSpendCents / walked.proteinGrams,
    nutritionMissing: walked.nutritionMissing,
    openNutritionMissing: walked.openNutritionMissing,
    byDay: [...walked.byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayKey, totals]) => ({
        dayKey,
        ...totals,
        leftOut: dedupe(totals.leftOut),
      })),
    byType: MEAL_TYPES.flatMap((mealType) => {
      const totals = walked.byType.get(mealType);
      return totals
        ? [{ mealType, ...totals, leftOut: dedupe(totals.leftOut) }]
        : [];
    }),
  };
}
