import type {
  Gap,
  MealItem,
  PlannedMeal,
  PlannedSnapshot,
  Product,
  RecipeCost,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { DEFAULT_SERVING } from '@apps/pinch/constants';
import {
  getMealNutrition,
  type NutritionResult,
} from '@apps/pinch/utils/nutritionMath';
import { getLineCost } from '@apps/pinch/utils/recipeMath';

export interface CostContext {
  recipeCosts: Map<string, RecipeCost>;
  ingredientsById: Map<string, ResolvedIngredient>;
  defaultProducts: Map<string, Product>;
  recipeNutrition: Map<string, NutritionResult>;
}

export interface ItemCost {
  /** Unrounded cents for the item's servings; null when nothing could be priced. */
  cents: number | null;
  gaps: Gap[];
}

export interface MealCost {
  totalCents: number | null;
  leftOut: Gap[];
  items: Map<string, ItemCost>;
}

/** What `servings` of a recipe or an ingredient costs: a recipe by its per-serving cost, an ingredient by its serving size priced from its default product. */
export function getItemCost(
  item: MealItem,
  { recipeCosts, ingredientsById, defaultProducts }: CostContext,
): ItemCost {
  if (item.kind === 'RECIPE') {
    const cost = recipeCosts.get(item.refId);
    return {
      cents:
        cost?.perServingCents == null
          ? null
          : cost.perServingCents * item.servings,
      gaps: cost?.leftOut ?? [],
    };
  }

  const ingredient = ingredientsById.get(item.refId);
  const serving = ingredient?.serving ?? DEFAULT_SERVING;
  const line = getLineCost(
    {
      id: item.id,
      ingredientId: item.refId,
      amount: serving.amount,
      unit: serving.unit,
      note: null,
    },
    ingredient,
    defaultProducts.get(item.refId),
  );
  return {
    cents: line.cents === null ? null : line.cents * item.servings,
    gaps: line.gap ? [line.gap] : [],
  };
}

/** A meal's total and what it leaves out, with each item's own cost. Rounding is left to the display. */
export function getMealCost(items: MealItem[], context: CostContext): MealCost {
  const costs = items.map((item) => getItemCost(item, context));
  const priced = costs.flatMap((cost) =>
    cost.cents === null ? [] : [cost.cents],
  );
  const leftOut = costs
    .flatMap((cost) => cost.gaps)
    .filter(
      (gap, index, all) =>
        all.findIndex(
          (other) =>
            other.kind === gap.kind && other.ingredientId === gap.ingredientId,
        ) === index,
    );

  return {
    totalCents:
      priced.length === 0
        ? null
        : priced.reduce((sum, cents) => sum + cents, 0),
    leftOut,
    items: new Map(items.map((item, index) => [item.id, costs[index]])),
  };
}

/** A planned meal's cost: what it was when its day passed if it has been frozen, otherwise what it is now. */
export function getPlannedMealCost(
  meal: PlannedMeal,
  context: CostContext,
): MealCost {
  const { snapshot } = meal;
  if (!snapshot) {
    return getMealCost(meal.items, context);
  }

  return {
    totalCents: snapshot.costCents,
    leftOut: snapshot.leftOut,
    items: new Map(
      snapshot.lines.map((line) => [
        line.itemId,
        { cents: line.costCents, gaps: [] },
      ]),
    ),
  };
}

/** Several meals' costs added up, with what any of them left out. */
export function combineMealCosts(costs: MealCost[]): Omit<MealCost, 'items'> {
  const priced = costs.flatMap((cost) =>
    cost.totalCents === null ? [] : [cost.totalCents],
  );

  return {
    totalCents:
      priced.length === 0
        ? null
        : priced.reduce((sum, cents) => sum + cents, 0),
    leftOut: [
      ...new Map(
        costs
          .flatMap((cost) => cost.leftOut)
          .map((gap) => [`${gap.kind}:${gap.ingredientId}`, gap]),
      ).values(),
    ],
  };
}

/** The write-once record of a meal's cost and nutrition, taken from the data as it is now. */
export function buildSnapshot(
  items: MealItem[],
  context: CostContext,
  frozenAt: number,
): PlannedSnapshot {
  const cost = getMealCost(items, context);
  const nutrition = getMealNutrition(
    items,
    context.recipeNutrition,
    context.ingredientsById,
  );

  return {
    frozenAt,
    costCents: cost.totalCents,
    leftOut: cost.leftOut.map(({ kind, ingredientId }) => ({
      kind,
      ingredientId,
    })),
    nutrition: nutrition.values,
    lines: items.map((item) => ({
      itemId: item.id,
      costCents: cost.items.get(item.id)?.cents ?? null,
    })),
  };
}
