import type {
  LineCost,
  Product,
  Recipe,
  RecipeCost,
  RecipeIngredient,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { bridge, toBase } from '@apps/pinch/utils/quantity';
import { getUnitCost } from '@apps/pinch/utils/unitCost';

/** What one recipe line costs from the ingredient's product: unrounded cents, or the gap that kept it from being priced. A line with no amount is neither priced nor a gap. */
export function getLineCost(
  line: RecipeIngredient,
  ingredient: ResolvedIngredient | undefined,
  product: Product | undefined,
): LineCost {
  if (line.amount === null) {
    return { cents: null, gap: null };
  }
  if (!product) {
    return {
      cents: null,
      gap: { kind: 'NO_PRODUCT', ingredientId: line.ingredientId },
    };
  }

  const unitCost = getUnitCost(product);
  const conversions = {
    gramsPerMl: ingredient?.gramsPerMl ?? null,
    gramsEach: ingredient?.gramsEach ?? null,
  };
  const quantity = bridge(
    toBase(line.amount, line.unit),
    unitCost.dimension,
    conversions,
  );
  if (!quantity) {
    return {
      cents: null,
      gap: { kind: 'NOT_COMPARABLE', ingredientId: line.ingredientId },
    };
  }

  return { cents: quantity.value * unitCost.centsPerBase, gap: null };
}

/** A recipe's total and per-serving cost from its ingredients' default products, plus what the total leaves out. Rounding is left to the display. */
export function getRecipeCost(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
  defaultProducts: Map<string, Product>,
): RecipeCost {
  const lines = new Map(
    recipe.ingredients.map((line) => [
      line.id,
      getLineCost(
        line,
        ingredientsById.get(line.ingredientId),
        defaultProducts.get(line.ingredientId),
      ),
    ]),
  );
  const priced = [...lines.values()].flatMap((line) =>
    line.cents === null ? [] : [line.cents],
  );
  const leftOut = [...lines.values()]
    .flatMap((line) => (line.gap ? [line.gap] : []))
    .filter(
      (gap, index, all) =>
        all.findIndex(
          (other) =>
            other.kind === gap.kind && other.ingredientId === gap.ingredientId,
        ) === index,
    );
  const totalCents =
    priced.length === 0 ? null : priced.reduce((sum, cents) => sum + cents, 0);

  return {
    totalCents,
    perServingCents: totalCents === null ? null : totalCents / recipe.servings,
    leftOut,
    lines,
  };
}
