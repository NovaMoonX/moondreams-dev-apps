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
  /** Null for a line that is just the name ("Parsley"), always in `EACH`. */
  amount: number | null;
  unit: Unit;
}

export interface ShoppingRowData {
  /** One ingredient's amounts of the same kind (weights, volumes or counts) share a row. */
  id: string;
  /** Every stored item the row stands for, largest first. */
  itemIds: string[];
  name: string;
  /** What to pick up, or null for a pinch of a spice or oil or a line that is just the name, which needs only its name. */
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

type MaybeAmount = Pick<ShoppingLine, 'amount' | 'unit'>;

const PANTRY_SIZED_ML = UNIT_TO_BASE.TBSP - 0.01;
const PANTRY_SIZED_G = 15;

/** One ingredient's amounts of the same kind summed in the unit of the largest, a count rounded up to whole ones; null when none has an amount. */
export function sumShopAmounts(parts: MaybeAmount[]): ShopAmount | null {
  const known = parts.flatMap((part) =>
    part.amount === null ? [] : [{ amount: part.amount, unit: part.unit }],
  );
  if (known.length === 0) {
    return null;
  }
  const based = known.map((part) => ({
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
  parts: MaybeAmount[],
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

/** Two amounts of one item added together: a name-only one adds nothing, and two of them stay just the name. */
const addAmounts = (a: number | null, b: number | null) =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/** Adds up lines with the same ingredient and unit, rounding once at the end; units are never converted. A name-only line is dropped when another line names the same ingredient with an amount. */
export function mergeLines(lines: ShoppingLine[]): ShoppingLine[] {
  const sums = lines.reduce((acc, line) => {
    const id = getShoppingItemId(line.ingredientId, line.unit);
    const known = acc.get(id);
    return acc.set(id, {
      ...line,
      amount: known ? addAmounts(known.amount, line.amount) : line.amount,
    });
  }, new Map<string, ShoppingLine>());

  const merged = [...sums.values()].flatMap((line): ShoppingLine[] => {
    if (line.amount === null) return [line];
    if (!Number.isFinite(line.amount)) return [];
    const amount = Math.min(roundAmount(line.amount), MAX_SHOPPING_AMOUNT);
    return amount > 0 ? [{ ...line, amount }] : [];
  });
  const withAmount = new Set(
    merged
      .filter((line) => line.amount !== null)
      .map((line) => line.ingredientId),
  );
  return merged.filter(
    (line) => line.amount !== null || !withAmount.has(line.ingredientId),
  );
}

export interface ShoppingFields {
  amount: number | null;
  isChecked: boolean;
  updatedAt: number;
}

/** What a line writes onto its item. One already checked off starts again with just this amount, an open one gains it, and a missing one is created with `isChecked`. A name-only line adds nothing to an amount. */
export function getMergedFields(
  existing: Pick<ShoppingItem, 'amount' | 'isChecked'> | null,
  line: ShoppingLine,
  now: number,
  isChecked = false,
): ShoppingFields {
  const kept = existing && !existing.isChecked ? existing.amount : null;
  const sum = addAmounts(kept, line.amount);
  const fields: ShoppingFields = {
    amount:
      sum === null ? null : Math.min(roundAmount(sum), MAX_SHOPPING_AMOUNT),
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
        .map((line): ShoppingLine =>
          line.amount === null
            ? { ingredientId: line.ingredientId, amount: null, unit: 'EACH' }
            : {
                ingredientId: line.ingredientId,
                amount: scaleAmount(line.amount, servings, recipe.servings),
                unit: line.unit,
              },
        )
    : [];

/** A recipe's lines scaled from its own servings to `servings`; a line whose ingredient is gone is left out, and one with no amount stays just the name. */
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

type RowItem = Pick<ShoppingItem, 'id' | 'ingredientId' | 'amount' | 'unit'>;

/** Per ingredient that has an amount among the items, the row a name-only item of it joins. */
const getAmountRows = (items: RowItem[]) =>
  items
    .filter((item) => item.amount !== null)
    .reduce((acc, item) => {
      const id = getShopRowId(item.ingredientId, item.unit);
      const known = acc.get(item.ingredientId);
      return known !== undefined && known <= id
        ? acc
        : acc.set(item.ingredientId, id);
    }, new Map<string, string>());

const groupByRow = <T extends RowItem>(
  items: T[],
  getId: (item: T) => string,
) =>
  items.reduce((acc, item) => {
    const id = getId(item);
    return acc.set(id, [...(acc.get(id) ?? []), item]);
  }, new Map<string, T[]>());

/** Each item's row: its ingredient and kind of unit, except that a name-only item joins a row of the same ingredient that has an amount, so "Parsley" never sits beside "Parsley · 30 g". Pass the items of one side of the list. */
export function getItemRowIds(items: RowItem[]): Map<string, string> {
  const amountRows = getAmountRows(items);
  const result = new Map(
    items.map((item) => [
      item.id,
      (item.amount === null ? amountRows.get(item.ingredientId) : undefined) ??
        getShopRowId(item.ingredientId, item.unit),
    ]),
  );
  return result;
}

/** How many rows the open part of the list draws: the Shopping tab's badge. */
export const countOpenShopRows = (items: ShoppingItem[]) =>
  new Set(getItemRowIds(items.filter((item) => !item.isChecked)).values()).size;

/** The open items an add sheet's row would join: its own row's, or for a row that is just the name, the row the list draws for that ingredient. */
export function getOpenItemsByRow(
  rows: Pick<ShopLineRow, 'id' | 'ingredientId' | 'lines'>[],
  items: ShoppingItem[],
): Map<string, ShoppingItem[]> {
  const open = items.filter((item) => !item.isChecked);
  const rowIds = getItemRowIds(open);
  const amountRows = getAmountRows(open);
  const byDrawnRow = groupByRow(open, (item) => rowIds.get(item.id) ?? '');
  const byRow = groupByRow(open, (item) =>
    getShopRowId(item.ingredientId, item.unit),
  );
  const result = new Map(
    rows.flatMap((row) => {
      const isNameOnly = row.lines.every((line) => line.amount === null);
      const joined = isNameOnly
        ? byDrawnRow.get(amountRows.get(row.ingredientId) ?? row.id)
        : byRow.get(row.id);
      return joined ? [[row.id, joined] as const] : [];
    }),
  );
  return result;
}

/** Groups what is left and what is checked off, each by the section of the shop it is found in, in walking order with Other last, one row per ingredient and kind of unit. A row in `held` is drawn where it was (true is "Got it") while its own `isChecked` is the stored truth. */
export function groupShoppingItems(
  items: ShoppingItem[],
  ingredientsById: Map<string, ResolvedIngredient>,
  held: ReadonlyMap<string, boolean> = new Map(),
): Record<ShoppingView, ShoppingGroup[]> {
  const toRows = (side: ShoppingItem[], suffix: string) => {
    const rowIds = getItemRowIds(side);
    const byRow = groupByRow(
      side,
      (item) => `${rowIds.get(item.id) ?? ''}${suffix}`,
    );
    return [...byRow.entries()].map(([id, rowItems]) => {
      const ingredient = ingredientsById.get(rowItems[0].ingredientId);
      const section = getShopSection(ingredient);
      const byBase = [...rowItems].sort(
        (a, b) =>
          (b.amount ?? 0) * UNIT_TO_BASE[b.unit] -
            (a.amount ?? 0) * UNIT_TO_BASE[a.unit] || a.id.localeCompare(b.id),
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
  /** The rows the lines make on the list (one per ingredient and kind of unit), and how many of them are wholly priced. */
  rowCount: number;
  pricedRowCount: number;
}

/** Prices the amounts on the list, not whole packages, and says what it could not price. A line that is just the name has nothing to price, so it is neither counted nor left out. */
export function getShoppingCost(
  lines: ShoppingLine[],
  ingredientsById: Map<string, ResolvedIngredient>,
  defaultProducts: Map<string, Product>,
): ShoppingCost {
  const costs = lines
    .flatMap((line) => (line.amount === null ? [] : [line]))
    .map((line) => ({
      rowId: getShopRowId(line.ingredientId, line.unit),
      ...getLineCost(
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
    }));
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
  const unpricedRows = new Set(
    costs.filter((cost) => cost.cents === null).map((cost) => cost.rowId),
  );
  const rowCount = new Set(costs.map((cost) => cost.rowId)).size;

  return {
    totalCents:
      priced.length === 0
        ? null
        : priced.reduce((sum, cents) => sum + cents, 0),
    leftOut,
    rowCount,
    pricedRowCount: rowCount - unpricedRows.size,
  };
}

export type ShoppingCostCoverage = 'none' | 'tooFew' | 'some' | 'all';

/** How much of the list a total can speak for: below half of the rows priced it is not worth a number. */
export function getShoppingCostCoverage({
  totalCents,
  rowCount,
  pricedRowCount,
}: ShoppingCost): ShoppingCostCoverage {
  if (totalCents === null || pricedRowCount === 0) return 'none';
  if (pricedRowCount === rowCount) return 'all';
  return pricedRowCount * 2 < rowCount ? 'tooFew' : 'some';
}
