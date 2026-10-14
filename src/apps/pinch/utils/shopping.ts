import { MAX_SHOPPING_AMOUNT } from '@apps/pinch/constants';
import type {
  Gap,
  MealItem,
  Product,
  Recipe,
  ResolvedFamily,
  ResolvedIngredient,
  ShoppingItem,
  Unit,
} from '@apps/pinch/types';
import { getLineCost } from '@apps/pinch/utils/recipeMath';

/** An amount of one ingredient in one unit: what an add carries before it becomes a list item. */
export interface ShoppingLine {
  ingredientId: string;
  amount: number;
  unit: Unit;
}

export interface ShoppingRowData {
  id: string;
  name: string;
  amount: number;
  unit: Unit;
  isChecked: boolean;
}

export interface ShoppingGroup {
  /** A family id; empty for the group of ingredients without one. */
  id: string;
  name: string;
  rows: ShoppingRowData[];
}

export const OTHER_GROUP_NAME = 'Other';

export const roundAmount = (value: number) => Math.round(value * 100) / 100;

/** The list item for an ingredient in a unit. Units hold no double underscore, so the last `__` always splits them off. */
export const getShoppingItemId = (ingredientId: string, unit: Unit) =>
  `${ingredientId}__${unit}`;

/** Lines with the same ingredient and unit added together, rounded once at the end; units are never converted, and a line that rounds to nothing is dropped. */
export function mergeLines(lines: ShoppingLine[]): ShoppingLine[] {
  const sums = lines.reduce((acc, line) => {
    const id = getShoppingItemId(line.ingredientId, line.unit);
    return acc.set(id, {
      ...line,
      amount: (acc.get(id)?.amount ?? 0) + line.amount,
    });
  }, new Map<string, ShoppingLine>());

  return [...sums.values()]
    .map((line) => ({
      ...line,
      amount: Math.min(roundAmount(line.amount), MAX_SHOPPING_AMOUNT),
    }))
    .filter((line) => line.amount > 0);
}

const getRecipeRawLines = (
  recipe: Recipe,
  servings: number,
  ingredientsById: Map<string, ResolvedIngredient>,
): ShoppingLine[] =>
  recipe.ingredients
    .filter((line) => ingredientsById.has(line.ingredientId))
    .map((line) => ({
      ingredientId: line.ingredientId,
      amount: (line.amount * servings) / recipe.servings,
      unit: line.unit,
    }));

/** What cooking `servings` of a recipe takes: each line scaled by servings over the recipe's own, and a line whose ingredient is gone left out. */
export function getRecipeLines(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
  servings: number = recipe.servings,
): ShoppingLine[] {
  return mergeLines(getRecipeRawLines(recipe, servings, ingredientsById));
}

/** What a meal, a planned meal or a whole day takes: a recipe item scales its recipe by its servings, an ingredient item is its servings of the ingredient's serving size, and anything whose recipe or ingredient is gone is left out. */
export function getItemsLines(
  items: MealItem[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): ShoppingLine[] {
  return mergeLines(
    items.flatMap((item): ShoppingLine[] => {
      if (item.kind === 'RECIPE') {
        const recipe = recipesById.get(item.refId);
        return recipe
          ? getRecipeRawLines(recipe, item.servings, ingredientsById)
          : [];
      }
      const ingredient = ingredientsById.get(item.refId);
      return ingredient
        ? [
            {
              ingredientId: ingredient.id,
              amount: item.servings * ingredient.serving.amount,
              unit: ingredient.serving.unit,
            },
          ]
        : [];
    }),
  );
}

const byName = (a: ShoppingRowData, b: ShoppingRowData) =>
  a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit);

/** The list in one pass: what is left to buy grouped by ingredient family, in the Kitchen's family order with the ones that have none last as "Other", and what is bought on its own. */
export function groupShoppingItems(
  items: ShoppingItem[],
  ingredientsById: Map<string, ResolvedIngredient>,
  families: ResolvedFamily[],
): { groups: ShoppingGroup[]; checked: ShoppingRowData[] } {
  const familyOrder = new Map(
    families.map((family, index) => [family.id, index]),
  );
  const familyNames = new Map(
    families.map((family) => [family.id, family.name]),
  );
  const getRank = (familyId: string) =>
    familyOrder.get(familyId) ?? Number.MAX_SAFE_INTEGER;
  const entries = items.map((item) => {
    const ingredient = ingredientsById.get(item.ingredientId);
    const familyId = ingredient?.familyId ?? '';
    const row: ShoppingRowData = {
      id: item.id,
      name: ingredient?.name ?? 'Removed ingredient',
      amount: item.amount,
      unit: item.unit,
      isChecked: item.isChecked,
    };
    return { row, familyId: familyOrder.has(familyId) ? familyId : '' };
  });

  const buckets = entries
    .filter(({ row }) => !row.isChecked)
    .reduce((acc, { row, familyId }) => {
      acc.set(familyId, [...(acc.get(familyId) ?? []), row]);
      return acc;
    }, new Map<string, ShoppingRowData[]>());
  const groups = [...buckets.entries()]
    .map(([id, rows]) => ({
      id,
      name: familyNames.get(id) ?? OTHER_GROUP_NAME,
      rows: [...rows].sort(byName),
    }))
    .sort((a, b) => getRank(a.id) - getRank(b.id));
  const checked = entries
    .filter(({ row }) => row.isChecked)
    .map(({ row }) => row)
    .sort(byName);

  return { groups, checked };
}

export interface ShoppingCost {
  /** Unrounded cents of the lines that could be priced; null when none could. */
  totalCents: number | null;
  /** One entry per ingredient and kind that is missing from the total. */
  leftOut: Gap[];
}

/** About what the amounts on the list cost, priced from each ingredient's default product like a recipe's lines, and what that leaves out. It prices the amount, not whole packages. */
export function getShoppingCost(
  lines: ShoppingLine[],
  ingredientsById: Map<string, ResolvedIngredient>,
  defaultProducts: Map<string, Product>,
): ShoppingCost {
  const costs = lines.map((line) =>
    getLineCost(
      {
        id: getShoppingItemId(line.ingredientId, line.unit),
        ingredientId: line.ingredientId,
        amount: line.amount,
        unit: line.unit,
        note: null,
      },
      ingredientsById.get(line.ingredientId),
      defaultProducts.get(line.ingredientId),
    ),
  );
  const priced = costs.flatMap((cost) =>
    cost.cents === null ? [] : [cost.cents],
  );
  const leftOut = [
    ...new Map(
      costs
        .flatMap((cost) => (cost.gap ? [cost.gap] : []))
        .map((gap) => [`${gap.kind}:${gap.ingredientId}`, gap]),
    ).values(),
  ];

  return {
    totalCents:
      priced.length === 0
        ? null
        : priced.reduce((sum, cents) => sum + cents, 0),
    leftOut,
  };
}
