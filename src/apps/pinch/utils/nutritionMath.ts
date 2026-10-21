import { DEFAULT_SERVING, NUTRITION_METRICS } from '@apps/pinch/constants';
import type {
  Gap,
  MealItem,
  NutritionMetric,
  NutritionSwitches,
  NutritionValues,
  PlannedMeal,
  Recipe,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { bridge, toBase } from '@apps/pinch/utils/quantity';

export interface IngredientMissing {
  ingredientId: string;
  metric: NutritionMetric;
}

export interface NutritionResult {
  /** Per serving for a recipe, per plate for a meal; a metric nothing could be added up for is null. */
  values: NutritionValues;
  /** Ingredients that couldn't contribute to a metric, left out of its total. */
  missing: IngredientMissing[];
}

const NO_VALUES: NutritionValues = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
};

/** Grams in an amount of an ingredient, through the same bridge cost uses; null when it can't be bridged. */
const getGrams = (
  amount: number,
  unit: Parameters<typeof toBase>[1],
  ingredient: ResolvedIngredient | undefined,
) =>
  bridge(toBase(amount, unit), 'MASS', {
    gramsPerMl: ingredient?.gramsPerMl ?? null,
    gramsEach: ingredient?.gramsEach ?? null,
  })?.value ?? null;

const addUp = (
  parts: { ingredientId: string; grams: number | null }[],
  ingredientsById: Map<string, ResolvedIngredient>,
) =>
  NUTRITION_METRICS.reduce<{
    values: NutritionValues;
    missing: IngredientMissing[];
  }>(
    (acc, metric) => {
      const known = parts.flatMap((part) => {
        const per100g =
          ingredientsById.get(part.ingredientId)?.per100g[metric] ?? null;
        return part.grams === null || per100g === null
          ? []
          : [(part.grams / 100) * per100g];
      });
      const missing = parts
        .filter(
          (part) =>
            part.grams === null ||
            (ingredientsById.get(part.ingredientId)?.per100g[metric] ??
              null) === null,
        )
        .map((part) => ({ ingredientId: part.ingredientId, metric }));
      return {
        values: {
          ...acc.values,
          [metric]:
            known.length === 0
              ? null
              : known.reduce((sum, value) => sum + value, 0),
        },
        missing: [...acc.missing, ...missing],
      };
    },
    { values: NO_VALUES, missing: [] },
  );

/** A recipe's nutrition per serving: added up from its lines unless the person typed their own for a metric. A line with no amount adds nothing and is never missing. */
export function getRecipeNutrition(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
): NutritionResult {
  const summed = addUp(
    recipe.ingredients.flatMap((line) =>
      line.amount === null
        ? []
        : [
            {
              ingredientId: line.ingredientId,
              grams: getGrams(
                line.amount,
                line.unit,
                ingredientsById.get(line.ingredientId),
              ),
            },
          ],
    ),
    ingredientsById,
  );
  const override = recipe.nutritionOverride ?? NO_VALUES;

  return {
    values: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [
        metric,
        override[metric] ??
          (summed.values[metric] === null
            ? null
            : summed.values[metric] / recipe.servings),
      ]),
    ) as unknown as NutritionValues,
    missing: summed.missing.filter((entry) => override[entry.metric] === null),
  };
}

/** What `servings` of a recipe or an ingredient adds to the plate. */
export function getItemNutrition(
  item: MealItem,
  recipeNutrition: Map<string, NutritionResult>,
  ingredientsById: Map<string, ResolvedIngredient>,
): NutritionResult {
  const scale = (result: NutritionResult): NutritionResult => ({
    values: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [
        metric,
        result.values[metric] === null
          ? null
          : result.values[metric] * item.servings,
      ]),
    ) as unknown as NutritionValues,
    missing: result.missing,
  });

  if (item.kind === 'RECIPE') {
    return scale(
      recipeNutrition.get(item.refId) ?? { values: NO_VALUES, missing: [] },
    );
  }

  const ingredient = ingredientsById.get(item.refId);
  const serving = ingredient?.serving ?? DEFAULT_SERVING;
  return scale(
    addUp(
      [
        {
          ingredientId: item.refId,
          grams: getGrams(serving.amount, serving.unit, ingredient),
        },
      ],
      ingredientsById,
    ),
  );
}

/** A plate's nutrition: every item's added together, a metric known only when some item knows it. */
export function getMealNutrition(
  items: MealItem[],
  recipeNutrition: Map<string, NutritionResult>,
  ingredientsById: Map<string, ResolvedIngredient>,
): NutritionResult {
  const parts = items.map((item) =>
    getItemNutrition(item, recipeNutrition, ingredientsById),
  );
  return {
    values: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => {
        const known = parts.flatMap((part) =>
          part.values[metric] === null ? [] : [part.values[metric]],
        );
        return [
          metric,
          known.length === 0
            ? null
            : known.reduce((sum, value) => sum + value, 0),
        ];
      }),
    ) as unknown as NutritionValues,
    missing: parts.flatMap((part) => part.missing),
  };
}

/** A planned meal's nutrition: its snapshot once its day has passed, otherwise worked out now. A frozen meal has nothing missing to fill in. */
export function getPlannedMealNutrition(
  meal: PlannedMeal,
  recipeNutrition: Map<string, NutritionResult>,
  ingredientsById: Map<string, ResolvedIngredient>,
): NutritionResult {
  return meal.snapshot
    ? { values: meal.snapshot.nutrition, missing: [] }
    : getMealNutrition(meal.items, recipeNutrition, ingredientsById);
}

/** The ingredients missing a metric that is switched on, as gaps the nudge understands. */
export function getNutritionGaps(
  missing: IngredientMissing[],
  show: NutritionSwitches,
): Gap[] {
  return [
    ...new Map(
      missing
        .filter((entry) => show[entry.metric])
        .map((entry) => [
          entry.ingredientId,
          { kind: 'NO_NUTRITION' as const, ingredientId: entry.ingredientId },
        ]),
    ).values(),
  ];
}

/** Whether any switched-on metric has a value to show. */
export const hasShownValue = (
  values: NutritionValues,
  show: NutritionSwitches,
) =>
  NUTRITION_METRICS.some((metric) => show[metric] && values[metric] !== null);

export const hasAnyMetricOn = (show: NutritionSwitches) =>
  NUTRITION_METRICS.some((metric) => show[metric]);
