import { NUTRITION_METRICS } from '@apps/pinch/constants';
import type {
  Gap,
  NutritionValues,
  PlannedMeal,
  Recipe,
} from '@apps/pinch/types';
import {
  getPlannedDayKey,
  isDayInRange,
  type DayRange,
} from '@apps/pinch/utils/dayKeys';
import { formatCost } from '@apps/pinch/utils/mealFormat';
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

export interface PeriodStats {
  spendCents: number;
  plannedCount: number;
  /** Planned meals with at least one priced item: the average's divisor. */
  mealsPriced: number;
  avgPerMealCents: number | null;
  leftOut: Gap[];
  /** What only the meals that aren't frozen yet leave out: the part a new price can still change, and so the part worth a nudge. */
  openLeftOut: Gap[];
  /** Per metric, the average over the days that know it (for a single day, that day's own total), so a day with nothing known never pulls it toward zero; null when no day does. */
  dailyNutrition: NutritionValues;
  /** Spend over protein grams, for the meals where both are known. */
  proteinCentsPerGram: number | null;
  nutritionMissing: IngredientMissing[];
  openNutritionMissing: IngredientMissing[];
  byDay: (Totals & { dayKey: string })[];
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

/** One walk over the planned meals of a span of days, a month, a week or a day: the spend, the average per meal, the nutrition averages and the totals by day and by meal type. */
export function getPeriodStats(
  plannedMeals: PlannedMeal[],
  range: DayRange,
  context: CostContext,
): PeriodStats {
  const walked = plannedMeals.reduce(
    (acc, meal) => {
      const dayKey = getPlannedDayKey(meal.date);
      if (!isDayInRange(dayKey, range)) {
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
  };
}

/** How many distinct ingredients the planned meals of a span use, and how many of them have a price: "5 of 18 ingredients priced". A line with no amount can't be priced, so it isn't counted. */
export function getPricedCoverage(
  plannedMeals: PlannedMeal[],
  range: DayRange,
  recipesById: Map<string, Recipe>,
  leftOut: Gap[],
) {
  const usedIds = plannedMeals
    .filter((meal) => isDayInRange(getPlannedDayKey(meal.date), range))
    .flatMap((meal) => meal.items)
    .flatMap((item) =>
      item.kind === 'RECIPE'
        ? (recipesById
            .get(item.refId)
            ?.ingredients.flatMap((line) =>
              line.amount === null ? [] : [line.ingredientId],
            ) ?? [])
        : [item.refId],
    );
  const leftOutIds = new Set(leftOut.map((gap) => gap.ingredientId));
  const usedCount = new Set([...usedIds, ...leftOutIds]).size;

  return { usedCount, pricedCount: usedCount - leftOutIds.size };
}

/** A period's total as the summary line and its tile say it; from $1,000 up it drops its cents, so both always read the same figure. */
export const formatPeriodCost = (cents: number) =>
  cents >= 100_000
    ? formatCost(Math.round(cents / 100) * 100).replace(/\.00$/, '')
    : formatCost(cents);

type GapQualifier = 'SO_FAR' | 'PLUS' | null;

/** How a figure built from a period's cost owns up to what it leaves out: "so far" while a price added now can still change it, "+" once every gap sits on a day that has passed. */
const getGapQualifier = (
  stats: Pick<PeriodStats, 'leftOut' | 'openLeftOut'>,
): GapQualifier => {
  if (stats.leftOut.length === 0) return null;
  return stats.openLeftOut.length > 0 ? 'SO_FAR' : 'PLUS';
};

/** "$4.10", "$4.10 so far" while a left-out ingredient can still be priced, "$4.10+" once every gap is on a fixed day, "No price yet" with nothing priced, "Not priced" for a span that has passed. */
export function getPeriodCostText(
  stats: Pick<
    PeriodStats,
    'spendCents' | 'mealsPriced' | 'leftOut' | 'openLeftOut'
  >,
  isPast: boolean,
) {
  if (stats.mealsPriced === 0) return isPast ? 'Not priced' : 'No price yet';
  const figure = formatPeriodCost(stats.spendCents);
  const qualifier = getGapQualifier(stats);
  if (qualifier === 'SO_FAR') return `${figure} so far`;
  return qualifier === 'PLUS' ? `${figure}+` : figure;
}

export interface CostAverage {
  key: 'avg' | 'protein';
  label: string;
  value: string;
}

/** A period's cost averages, worded once for the calendar's averages line and its summary sheet: "Avg per meal" from two priced meals and "Per g protein" while protein is on, each "so far" while a gap can still be priced and "+" once every gap is fixed; empty when neither has a figure. */
export function getCostAverages(
  stats: Pick<
    PeriodStats,
    | 'mealsPriced'
    | 'avgPerMealCents'
    | 'proteinCentsPerGram'
    | 'leftOut'
    | 'openLeftOut'
  >,
  isProteinOn: boolean,
): CostAverage[] {
  const qualifier = getGapQualifier(stats);
  const word = (key: CostAverage['key'], label: string, cents: number) => ({
    key,
    label: qualifier === 'SO_FAR' ? `${label} so far` : label,
    value: qualifier === 'PLUS' ? `${formatCost(cents)}+` : formatCost(cents),
  });
  const averages = [
    stats.mealsPriced >= 2 && stats.avgPerMealCents !== null
      ? word('avg', 'Avg per meal', stats.avgPerMealCents)
      : null,
    isProteinOn && stats.proteinCentsPerGram !== null
      ? word('protein', 'Per g protein', stats.proteinCentsPerGram)
      : null,
  ].filter((average) => average !== null);

  return averages;
}

/** One day's cost in a list: "$0.08", "$0.08+" while it leaves something out, "No price yet", or "Not priced" once the day has passed. */
export function getDayCostText(
  totals: Pick<Totals, 'totalCents' | 'leftOut'>,
  isPast: boolean,
) {
  if (totals.totalCents === null) return isPast ? 'Not priced' : 'No price yet';
  const figure = formatCost(totals.totalCents);
  return totals.leftOut.length > 0 ? `${figure}+` : figure;
}

/** Calories as a whole number, the way every screen shows them; the other metrics keep their decimal. */
export const withWholeCalories = (
  values: NutritionValues,
): NutritionValues => ({
  ...values,
  calories: values.calories === null ? null : Math.round(values.calories),
});
