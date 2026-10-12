import { MEAL_TYPES } from '@apps/pinch/constants';
import type { Gap, MealType, PlannedMeal } from '@apps/pinch/types';
import { getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { getMealCost, type CostContext } from '@apps/pinch/utils/mealMath';

export interface Totals {
  /** Unrounded cents of what could be priced; null when nothing was. */
  totalCents: number | null;
  count: number;
  leftOut: Gap[];
}

export interface MonthStats {
  spendCents: number;
  plannedCount: number;
  /** Planned meals with at least one priced item: the average's divisor. */
  mealsPriced: number;
  avgPerMealCents: number | null;
  leftOut: Gap[];
  byDay: (Totals & { dayKey: string })[];
  byType: (Totals & { mealType: MealType })[];
}

const addTotals = (
  current: Totals | undefined,
  totalCents: number | null,
  leftOut: Gap[],
): Totals => ({
  totalCents:
    current?.totalCents == null && totalCents === null
      ? null
      : (current?.totalCents ?? 0) + (totalCents ?? 0),
  count: (current?.count ?? 0) + 1,
  leftOut: [...(current?.leftOut ?? []), ...leftOut],
});

const dedupe = (gaps: Gap[]) => [
  ...new Map(
    gaps.map((gap) => [`${gap.kind}:${gap.ingredientId}`, gap]),
  ).values(),
];

/** One walk over the planned meals of a month: the spend, the average per meal and the totals by day and by meal type. */
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

      const cost = getMealCost(meal.items, context);
      acc.byDay.set(
        dayKey,
        addTotals(acc.byDay.get(dayKey), cost.totalCents, cost.leftOut),
      );
      acc.byType.set(
        meal.mealType,
        addTotals(acc.byType.get(meal.mealType), cost.totalCents, cost.leftOut),
      );
      acc.plannedCount += 1;
      acc.leftOut.push(...cost.leftOut);
      if (cost.totalCents !== null) {
        acc.spendCents += cost.totalCents;
        acc.mealsPriced += 1;
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
    },
  );

  return {
    spendCents: walked.spendCents,
    plannedCount: walked.plannedCount,
    mealsPriced: walked.mealsPriced,
    avgPerMealCents:
      walked.mealsPriced === 0 ? null : walked.spendCents / walked.mealsPriced,
    leftOut: dedupe(walked.leftOut),
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
