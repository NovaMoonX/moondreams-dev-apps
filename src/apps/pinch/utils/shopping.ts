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

/** An amount an item can hold: above zero, at most the cap. Round it first, since a typed 0.004 is nothing. */
export const isValidAmount = (amount: number) =>
  Number.isFinite(amount) && amount > 0 && amount <= MAX_SHOPPING_AMOUNT;

/** Units never contain `__`, so no two items share an id. */
export const getShoppingItemId = (ingredientId: string, unit: Unit) =>
  `${ingredientId}__${unit}`;

/** Adds up lines with the same ingredient and unit, rounding once at the end; units are never converted. */
export function mergeLines(lines: ShoppingLine[]): ShoppingLine[] {
  const sums = lines.reduce((acc, line) => {
    const id = getShoppingItemId(line.ingredientId, line.unit);
    return acc.set(id, {
      ...line,
      amount: (acc.get(id)?.amount ?? 0) + line.amount,
    });
  }, new Map<string, ShoppingLine>());

  return [...sums.values()]
    .filter((line) => Number.isFinite(line.amount))
    .map((line) => ({
      ...line,
      amount: Math.min(roundAmount(line.amount), MAX_SHOPPING_AMOUNT),
    }))
    .filter((line) => line.amount > 0);
}

export interface ShoppingFields {
  amount: number;
  isChecked: boolean;
  updatedAt: number;
}

/** What a line writes onto its item. One already checked off starts again with just this amount, an open one gains it, and a missing one is created with `isChecked`. */
export function getMergedFields(
  existing: Pick<ShoppingItem, 'amount' | 'isChecked'> | null,
  line: ShoppingLine,
  now: number,
  isChecked = false,
): ShoppingFields {
  const gained = existing && !existing.isChecked ? existing.amount : 0;
  const fields: ShoppingFields = {
    amount: Math.min(roundAmount(gained + line.amount), MAX_SHOPPING_AMOUNT),
    isChecked: existing ? false : isChecked,
    updatedAt: now,
  };

  return fields;
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

/** A recipe's lines scaled from its own servings to `servings`; a line whose ingredient is gone is left out. */
export function getRecipeLines(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
  servings: number = recipe.servings,
): ShoppingLine[] {
  return mergeLines(getRecipeRawLines(recipe, servings, ingredientsById));
}

/** The lines of a meal or a day: a recipe item scales its recipe by its servings, an ingredient item is its servings of one serving size. */
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

/** Groups what is left by ingredient family, with "Other" last, and keeps what is checked off apart. A row in `held` is drawn where it was (true is "Got it") while its own `isChecked` is the stored truth. */
export function groupShoppingItems(
  items: ShoppingItem[],
  ingredientsById: Map<string, ResolvedIngredient>,
  families: ResolvedFamily[],
  held: ReadonlyMap<string, boolean> = new Map(),
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
    return {
      row,
      isGot: held.get(item.id) ?? item.isChecked,
      familyId: familyOrder.has(familyId) ? familyId : '',
    };
  });

  const buckets = entries
    .filter(({ isGot }) => !isGot)
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
    .filter(({ isGot }) => isGot)
    .map(({ row }) => row)
    .sort(byName);

  return { groups, checked };
}

export interface ShoppingCost {
  /** Unrounded; null when no line could be priced. */
  totalCents: number | null;
  leftOut: Gap[];
}

/** Prices the amounts on the list, not whole packages, and says what it could not price. */
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
