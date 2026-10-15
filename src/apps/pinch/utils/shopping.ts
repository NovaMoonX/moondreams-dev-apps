import {
  MAX_SHOPPING_AMOUNT,
  SHOP_SECTION_BY_FAMILY,
  SHOP_SECTION_BY_INGREDIENT,
  SHOP_SECTION_LABELS,
  SHOP_SECTIONS,
  UNIT_DIMENSION,
  UNIT_TO_BASE,
  USUALLY_AT_HOME_IDS,
  type ShopSection,
} from '@apps/pinch/constants';
import type {
  Gap,
  MealItem,
  PlannedMeal,
  Product,
  Recipe,
  ResolvedIngredient,
  ShoppingItem,
  ShoppingView,
  Unit,
} from '@apps/pinch/types';
import type { DayRange } from '@apps/pinch/utils/dayKeys';
import { formatSize } from '@apps/pinch/utils/productFormat';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { getLineCost } from '@apps/pinch/utils/recipeMath';

export interface ShoppingLine {
  ingredientId: string;
  amount: number;
  unit: Unit;
}

export interface ShoppingRowData {
  /** One ingredient's amounts of the same kind (weights, volumes or counts) share a row. */
  id: string;
  /** Every stored item the row stands for, largest first. */
  itemIds: string[];
  name: string;
  /** What to pick up, or null for a pinch of a spice or oil, which needs only its name. */
  amountText: string | null;
  isChecked: boolean;
}

export interface ShoppingGroup {
  id: ShopSection;
  name: string;
  rows: ShoppingRowData[];
}

/** Where an ingredient is found in a shop: its own shelf when the catalog moves it, else its family's, else Other. */
export const getShopSection = (
  ingredient: Pick<ResolvedIngredient, 'id' | 'familyId'> | undefined,
): ShopSection =>
  (ingredient &&
    (SHOP_SECTION_BY_INGREDIENT[ingredient.id] ??
      (ingredient.familyId === null
        ? undefined
        : SHOP_SECTION_BY_FAMILY[ingredient.familyId]))) ??
  'other';

export const roundAmount = (value: number) => Math.round(value * 100) / 100;

/** The row a stored item or a line belongs to: its ingredient and the kind of unit, since weights add up with weights. */
export const getShopRowId = (ingredientId: string, unit: Unit) =>
  `${ingredientId}::${UNIT_DIMENSION[unit]}`;

export interface ShopAmount {
  amount: number;
  unit: Unit;
}

const PANTRY_SIZED_ML = UNIT_TO_BASE.TBSP - 0.01;
const PANTRY_SIZED_G = 15;

/** One ingredient's amounts of the same kind summed in the unit of the largest, a count rounded up to whole ones. */
export function sumShopAmounts(parts: ShopAmount[]): ShopAmount | null {
  if (parts.length === 0) {
    return null;
  }
  const based = parts.map((part) => ({
    unit: part.unit,
    base: part.amount * UNIT_TO_BASE[part.unit],
  }));
  const lead = based.reduce((best, part) =>
    part.base > best.base ? part : best,
  );
  const total = based.reduce((sum, part) => sum + part.base, 0);
  const amount = roundAmount(total / UNIT_TO_BASE[lead.unit]);
  const result = {
    amount: UNIT_DIMENSION[lead.unit] === 'COUNT' ? Math.ceil(amount) : amount,
    unit: lead.unit,
  };
  return result;
}

/** What to pick up in a shop; null for less than a tablespoon (or 15 g) of a spice or oil, which is on the shelf at home or bought by the jar. */
export function getShopAmount(
  parts: ShopAmount[],
  section: ShopSection,
): ShopAmount | null {
  const sum = sumShopAmounts(parts);
  if (!sum || section !== 'spices') {
    return sum;
  }
  const base = sum.amount * UNIT_TO_BASE[sum.unit];
  const dimension = UNIT_DIMENSION[sum.unit];
  const isPinch =
    (dimension === 'VOLUME' && base < PANTRY_SIZED_ML) ||
    (dimension === 'MASS' && base < PANTRY_SIZED_G);
  return isPinch ? null : sum;
}

export const formatShopAmount = (amount: ShopAmount | null) =>
  amount ? formatSize(amount.amount, amount.unit) : null;

/** Spices, oils, vinegar, salt and water: what an add sheet leaves unticked, since most kitchens have them. */
export const isUsuallyAtHome = (
  row: Pick<ShopLineRow, 'ingredientId' | 'section'>,
) => row.section === 'spices' || USUALLY_AT_HOME_IDS.includes(row.ingredientId);

export interface ShopLineRow {
  id: string;
  ingredientId: string;
  name: string;
  section: ShopSection;
  lines: ShoppingLine[];
  amountText: string | null;
}

/** An add sheet's rows: one per ingredient and kind of unit, in the order the lines came, each with what to pick up. */
export function groupShopLines(
  lines: ShoppingLine[],
  ingredientsById: Map<string, ResolvedIngredient>,
): ShopLineRow[] {
  const byRow = lines.reduce((acc, line) => {
    const id = getShopRowId(line.ingredientId, line.unit);
    return acc.set(id, [...(acc.get(id) ?? []), line]);
  }, new Map<string, ShoppingLine[]>());

  const result = [...byRow.entries()].map(([id, rowLines]) => {
    const ingredient = ingredientsById.get(rowLines[0].ingredientId);
    const section = getShopSection(ingredient);
    return {
      id,
      ingredientId: rowLines[0].ingredientId,
      name: ingredient?.name ?? 'Removed ingredient',
      section,
      lines: rowLines,
      amountText: formatShopAmount(getShopAmount(rowLines, section)),
    };
  });
  return result;
}

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
  recipe.servings > 0
    ? recipe.ingredients
        .filter((line) => ingredientsById.has(line.ingredientId))
        .map((line) => ({
          ingredientId: line.ingredientId,
          amount: scaleAmount(line.amount, servings, recipe.servings),
          unit: line.unit,
        }))
    : [];

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

export interface PlanSpan {
  /** The first day counted: the range's own, or today when the range began earlier. */
  startKey: string;
  endKey: string;
  meals: PlannedMeal[];
  /** The range began before today, so the days that have passed were left out. */
  isClamped: boolean;
}

/** The planned meals of a range of days, from today on, in day order. */
export function getPlanInRange(
  plannedByDay: Map<string, PlannedMeal[]>,
  { startKey, endKey }: DayRange,
  todayKey: string,
): PlanSpan {
  const fromKey = startKey < todayKey ? todayKey : startKey;
  const meals = [...plannedByDay.entries()]
    .filter(([dayKey]) => dayKey >= fromKey && dayKey <= endKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, dayMeals]) => dayMeals);

  return {
    startKey: fromKey,
    endKey,
    meals,
    isClamped: startKey < todayKey,
  };
}

const byName = (a: ShoppingRowData, b: ShoppingRowData) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** Groups what is left and what is checked off, each by the section of the shop it is found in, in walking order with Other last, one row per ingredient and kind of unit. A row in `held` is drawn where it was (true is "Got it") while its own `isChecked` is the stored truth. */
export function groupShoppingItems(
  items: ShoppingItem[],
  ingredientsById: Map<string, ResolvedIngredient>,
  held: ReadonlyMap<string, boolean> = new Map(),
): Record<ShoppingView, ShoppingGroup[]> {
  const toRows = (side: ShoppingItem[], suffix: string) => {
    const byRow = side.reduce((acc, item) => {
      const id = `${getShopRowId(item.ingredientId, item.unit)}${suffix}`;
      return acc.set(id, [...(acc.get(id) ?? []), item]);
    }, new Map<string, ShoppingItem[]>());
    return [...byRow.entries()].map(([id, rowItems]) => {
      const ingredient = ingredientsById.get(rowItems[0].ingredientId);
      const section = getShopSection(ingredient);
      const byBase = [...rowItems].sort(
        (a, b) =>
          b.amount * UNIT_TO_BASE[b.unit] - a.amount * UNIT_TO_BASE[a.unit] ||
          a.id.localeCompare(b.id),
      );
      const row: ShoppingRowData = {
        id,
        itemIds: byBase.map((item) => item.id),
        name: ingredient?.name ?? 'Removed ingredient',
        amountText: formatShopAmount(getShopAmount(rowItems, section)),
        isChecked: byBase[0].isChecked,
      };
      return { row, section };
    });
  };

  const toGroups = (side: ShoppingItem[], suffix: string) => {
    const buckets = toRows(side, suffix).reduce((acc, { row, section }) => {
      acc.set(section, [...(acc.get(section) ?? []), row]);
      return acc;
    }, new Map<ShopSection, ShoppingRowData[]>());
    const result = SHOP_SECTIONS.flatMap((section) => {
      const rows = buckets.get(section);
      return rows
        ? [
            {
              id: section,
              name: SHOP_SECTION_LABELS[section],
              rows: [...rows].sort(byName),
            },
          ]
        : [];
    });
    return result;
  };

  const isGot = (item: ShoppingItem) => held.get(item.id) ?? item.isChecked;
  const grouped = {
    toBuy: toGroups(
      items.filter((item) => !isGot(item)),
      '',
    ),
    got: toGroups(items.filter(isGot), '/got'),
  };
  return grouped;
}

/** The view the list shows: the person's pick, unless what was typed since then matches nothing there and something in the other view. */
export function getShownShoppingView(
  pick: { view: ShoppingView; query: string },
  query: string,
  matches: Record<ShoppingView, number>,
): ShoppingView {
  const other: ShoppingView = pick.view === 'toBuy' ? 'got' : 'toBuy';
  const isNewSearch = query !== '' && query !== pick.query;
  const view =
    isNewSearch && matches[pick.view] === 0 && matches[other] > 0
      ? other
      : pick.view;
  return view;
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
