import {
  MIN_FULLY_PRICED_MEALS,
  NUTRITION_METRICS,
} from '@apps/pinch/constants';
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
  type MealCost,
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
  /** Planned meals with at least one priced item: the Total's "nothing priced" test. */
  mealsPriced: number;
  /** Planned meals with a price and nothing left out: the only ones an average divides over, since a meal with a gap is a floor. */
  fullyPricedMeals: number;
  /** What those meals cost on average; null with none. */
  avgPerFullyPricedMealCents: number | null;
  leftOut: Gap[];
  /** What only the meals that aren't frozen yet leave out: the part a new price can still change, and so the part worth a nudge. */
  openLeftOut: Gap[];
  /** Per metric, the average over the days that know it (for a single day, that day's own total), so a day with nothing known never pulls it toward zero; null when no day does. */
  dailyNutrition: NutritionValues;
  /** Spend over protein grams, for the fully priced meals that know their protein. */
  proteinCentsPerGram: number | null;
  /** How many meals that figure comes from. */
  proteinPricedMeals: number;
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

const isFullyPriced = (cost: MealCost) =>
  cost.totalCents !== null &&
  cost.leftOut.length === 0 &&
  [...cost.items.values()].every((item) => item.cents !== null);

/** One walk over the planned meals of a span of days, a month, a week or a day: the spend, the average per fully priced meal, the nutrition averages and the totals by day and by meal type. */
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
      }
      if (cost.totalCents !== null && isFullyPriced(cost)) {
        acc.fullSpendCents += cost.totalCents;
        acc.fullyPricedMeals += 1;
        if (nutrition.values.protein !== null && nutrition.values.protein > 0) {
          acc.proteinSpendCents += cost.totalCents;
          acc.proteinGrams += nutrition.values.protein;
          acc.proteinPricedMeals += 1;
        }
      }
      return acc;
    },
    {
      byDay: new Map<string, Totals>(),
      plannedCount: 0,
      spendCents: 0,
      mealsPriced: 0,
      fullSpendCents: 0,
      fullyPricedMeals: 0,
      leftOut: [] as Gap[],
      nutrition: undefined as NutritionValues | undefined,
      nutritionMissing: [] as IngredientMissing[],
      openLeftOut: [] as Gap[],
      openNutritionMissing: [] as IngredientMissing[],
      proteinSpendCents: 0,
      proteinGrams: 0,
      proteinPricedMeals: 0,
    },
  );

  return {
    spendCents: walked.spendCents,
    plannedCount: walked.plannedCount,
    mealsPriced: walked.mealsPriced,
    fullyPricedMeals: walked.fullyPricedMeals,
    avgPerFullyPricedMealCents:
      walked.fullyPricedMeals === 0
        ? null
        : walked.fullSpendCents / walked.fullyPricedMeals,
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
    proteinPricedMeals: walked.proteinPricedMeals,
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

const getPeriodFigure = (
  stats: Pick<PeriodStats, 'spendCents' | 'leftOut' | 'openLeftOut'>,
) => ({
  figure: formatPeriodCost(stats.spendCents),
  qualifier: getGapQualifier(stats),
});

/** "$4.10", "$4.10 so far" while a left-out ingredient can still be priced, "$4.10+" once every gap is on a fixed day, "No price yet" with nothing priced, "Not priced" for a span that has passed. */
export function getPeriodCostText(
  stats: Pick<
    PeriodStats,
    'spendCents' | 'mealsPriced' | 'leftOut' | 'openLeftOut'
  >,
  isPast: boolean,
) {
  if (stats.mealsPriced === 0) return isPast ? 'Not priced' : 'No price yet';
  const { figure, qualifier } = getPeriodFigure(stats);
  if (qualifier === 'SO_FAR') return `${figure} so far`;
  return qualifier === 'PLUS' ? `${figure}+` : figure;
}

/** The Total tile's figure and caption, worded from the same figure as the summary line ("$4.10" over "Total so far", "$4.10+" over "Total"); null with nothing priced, when the line says "No price yet" itself. */
export function getPeriodCostTile(
  stats: Pick<
    PeriodStats,
    'spendCents' | 'mealsPriced' | 'leftOut' | 'openLeftOut'
  >,
): { value: string; label: string } | null {
  if (stats.mealsPriced === 0) return null;
  const { figure, qualifier } = getPeriodFigure(stats);
  return {
    value: qualifier === 'PLUS' ? `${figure}+` : figure,
    label: qualifier === 'SO_FAR' ? 'Total so far' : 'Total',
  };
}

/** The Total as the summary sheet's tile says it: the front tile's words, and the line's words ("No price yet", "Not priced") under the same name with nothing priced. */
export const getPeriodTotal = (
  stats: Pick<
    PeriodStats,
    'spendCents' | 'mealsPriced' | 'leftOut' | 'openLeftOut'
  >,
  isPast: boolean,
) =>
  getPeriodCostTile(stats) ?? {
    value: getPeriodCostText(stats, isPast),
    label: 'Total',
  };

export interface CostAverage {
  key: 'avg' | 'protein';
  label: string;
  value: string;
}

/** A period's cost averages, worded once for the stats tiles and the summary sheet. Each divides over fully priced meals only, since a meal with something left out is a floor, so it needs no "so far" or "+" and names its base; under three such meals it says nothing, not a figure from one or two dinners. */
export function getCostAverages(
  stats: Pick<
    PeriodStats,
    | 'fullyPricedMeals'
    | 'avgPerFullyPricedMealCents'
    | 'proteinPricedMeals'
    | 'proteinCentsPerGram'
  >,
  isProteinOn: boolean,
): CostAverage[] {
  const averages = [
    stats.fullyPricedMeals >= MIN_FULLY_PRICED_MEALS &&
    stats.avgPerFullyPricedMealCents !== null
      ? {
          key: 'avg' as const,
          label: 'Avg per fully priced meal',
          value: formatCost(stats.avgPerFullyPricedMealCents),
        }
      : null,
    isProteinOn &&
    stats.proteinPricedMeals >= MIN_FULLY_PRICED_MEALS &&
    stats.proteinCentsPerGram !== null
      ? {
          key: 'protein' as const,
          label: 'Per g protein, fully priced',
          value: formatCost(stats.proteinCentsPerGram),
        }
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
