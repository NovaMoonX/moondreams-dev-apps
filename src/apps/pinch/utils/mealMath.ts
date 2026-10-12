import type {
  Gap,
  MealItem,
  Product,
  RecipeCost,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { DEFAULT_SERVING } from '@apps/pinch/constants';
import type { NutritionResult } from '@apps/pinch/utils/nutritionMath';
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
