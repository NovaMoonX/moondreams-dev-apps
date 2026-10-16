import {
  MAX_SHOPPING_AMOUNT,
  MAX_SHOPPING_SOURCES,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
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
  Meal,
  MealItem,
  MealType,
  PlannedMeal,
  Product,
  Recipe,
  ResolvedIngredient,
  ShoppingHalf,
  ShoppingItem,
  ShoppingView,
  Unit,
} from '@apps/pinch/types';
import {
  addDaysToKey,
  formatDayShort,
  getDateOfDayKey,
  getPlannedDayKey,
  type DayRange,
} from '@apps/pinch/utils/dayKeys';
import { getPlannedMealTitle } from '@apps/pinch/utils/mealFormat';
import { formatSize } from '@apps/pinch/utils/productFormat';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { getLineCost } from '@apps/pinch/utils/recipeMath';

export interface ShoppingLine {
  ingredientId: string;
  /** Null for a line that is just the name ("Parsley"), always in `EACH`. */
  amount: number | null;
  unit: Unit;
}

/** A line and what puts it on the list: a planned meal's id, a recipe's or a saved meal's source, or null for something added on the list itself. */
export interface SourcedLine extends ShoppingLine {
  source: string | null;
}

/** What one item gains from an add: the amount, and every source behind it. */
export interface ListLine extends ShoppingLine {
  sources: string[];
}

/** Names a row's line spells out before "and N more", so the line stays within two lines on a phone. */
const MAX_SOURCE_NAMES_SHOWN = 2;

const RECIPE_SOURCE = 'recipe:';
const MEAL_SOURCE = 'meal:';

export const getRecipeShoppingSource = (recipeId: string) =>
  `${RECIPE_SOURCE}${recipeId}`;
export const getMealShoppingSource = (mealId: string) =>
  `${MEAL_SOURCE}${mealId}`;

export type ShoppingSourceKind = 'recipe' | 'meal' | 'planned';

/** What a source names: a recipe, a saved meal, or (anything else) a planned meal. */
export function parseShoppingSource(source: string): {
  kind: ShoppingSourceKind;
  id: string;
} {
  if (source.startsWith(RECIPE_SOURCE)) {
    return { kind: 'recipe', id: source.slice(RECIPE_SOURCE.length) };
  }
  if (source.startsWith(MEAL_SOURCE)) {
    return { kind: 'meal', id: source.slice(MEAL_SOURCE.length) };
  }
  return { kind: 'planned', id: source };
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
  /** What put the row's items on the list, each once. */
  sources: string[];
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
  lines: SourcedLine[];
  amountText: string | null;
}

/** An add sheet's rows: one per ingredient and kind of unit, in the order the lines came, each with what to pick up. A line with just the name joins a row of the same ingredient that has an amount, so "Salt" never shows twice. */
export function groupShopLines(
  lines: SourcedLine[],
  ingredientsById: Map<string, ResolvedIngredient>,
): ShopLineRow[] {
  const byRow = lines.reduce((acc, line) => {
    const id = getShopRowId(line.ingredientId, line.unit);
    return acc.set(id, [...(acc.get(id) ?? []), line]);
  }, new Map<string, SourcedLine[]>());
  const amountRowIds = [...byRow.entries()]
    .filter(([, rowLines]) => rowLines.some((line) => line.amount !== null))
    .reduce((acc, [id, rowLines]) => {
      const known = acc.get(rowLines[0].ingredientId);
      return known !== undefined && known <= id
        ? acc
        : acc.set(rowLines[0].ingredientId, id);
    }, new Map<string, string>());
  const joined = [...byRow.entries()].reduce((acc, [id, rowLines]) => {
    const isNameOnly = rowLines.every((line) => line.amount === null);
    const target =
      (isNameOnly ? amountRowIds.get(rowLines[0].ingredientId) : undefined) ??
      id;
    return acc.set(target, [...(acc.get(target) ?? []), ...rowLines]);
  }, new Map<string, SourcedLine[]>());

  const result = [...joined.entries()].map(([id, rowLines]) => {
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

export interface RowOnList {
  /** What ticking the row adds: the lines whose source hasn't put it on the list yet, or all of them once every source has (more, on purpose). */
  addLines: SourcedLine[];
  /** The row's sources that already put it on the list, still to buy or got. */
  matched: string[];
  /** Whether a matched source sits on something still to buy, rather than only on what was got. */
  isMatchedOpen: boolean;
  /** Every source behind the row already put it on the list, so it starts unticked. */
  isCovered: boolean;
}

/** How an add sheet's row stands against the list's items of the same row; a line put there by something else, or typed on the list, never counts as this row's. An open line written before sources were kept could be anyone's, so it still starts the row unticked. */
export function getRowOnList(
  lines: SourcedLine[],
  rowItems: ShoppingItem[],
): RowOnList {
  const sourcesOf = (items: ShoppingItem[]) =>
    new Set(items.flatMap((item) => item.sources ?? []));
  const openItems = rowItems.filter((item) => !item.isChecked);
  const open = sourcesOf(openItems);
  const got = sourcesOf(rowItems.filter((item) => item.isChecked));
  const isListed = (source: string | null) =>
    !!source && (open.has(source) || got.has(source));
  const rowSources = [
    ...new Set(lines.flatMap((line) => (line.source ? [line.source] : []))),
  ];
  const matched = rowSources.filter(isListed);
  const newLines = lines.filter((line) => !isListed(line.source));
  const isCovered =
    (rowSources.length > 0 && newLines.length === 0) ||
    openItems.some((item) => item.sources === undefined);

  return {
    addLines: isCovered ? lines : newLines,
    matched,
    isMatchedOpen: matched.some((source) => open.has(source)),
    isCovered,
  };
}

/** "Thu dinner and Fri lunch", or "3 of these meals". */
export const formatSourceNames = (names: string[]) => {
  if (names.length <= 1) return names[0] ?? '';
  return names.length === 2
    ? `${names[0]} and ${names[1]}`
    : `${names.length} of these meals`;
};

/** The line under an add sheet's row. `openText` is undefined when nothing of the row is still to buy, null when what is has no amount (a pinch of a spice). */
export function getOnListHint(
  state: RowOnList,
  matchedText: string,
  openText: string | null | undefined,
): string | null {
  if (state.matched.length > 0) {
    const hint = `Already ${state.isMatchedOpen ? 'on your list' : 'got it'} for ${matchedText}`;
    return state.isCovered ? hint : `${hint}; this adds the rest`;
  }
  if (openText === undefined) return null;
  return openText ? `On your list · ${openText}` : 'On your list';
}

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
});

/** "Thu" for a day in the coming week, else "Oct 23", so a weekday never points at the wrong week. */
export const formatSourceDay = (dayKey: string, todayKey: string) =>
  dayKey >= todayKey && dayKey <= addDaysToKey(todayKey, 6)
    ? weekdayFormatter.format(getDateOfDayKey(dayKey))
    : formatDayShort(dayKey);

export interface ShoppingSourceLabel {
  name: string;
  kind: ShoppingSourceKind;
  /** A planned meal's day and slot; null for a recipe or a saved meal. */
  dayKey: string | null;
  mealType: MealType | null;
}

/** The name of every source on the list that still resolves; a planned meal, recipe or saved meal that is gone (or not loaded) is left out. */
export function getShoppingSourceLabels(
  items: ShoppingItem[],
  plannedMeals: PlannedMeal[],
  recipesById: Map<string, Recipe>,
  mealsById: Map<string, Meal>,
  ingredientsById: Map<string, ResolvedIngredient>,
): Map<string, ShoppingSourceLabel> {
  const sources = new Set(items.flatMap((item) => item.sources ?? []));
  const planned = new Map(
    plannedMeals
      .filter((meal) => sources.has(meal.id))
      .map((meal) => [meal.id, meal]),
  );
  const getLabel = (source: string): ShoppingSourceLabel | null => {
    const { kind, id } = parseShoppingSource(source);
    if (kind === 'recipe') {
      const title = recipesById.get(id)?.title;
      return title
        ? { name: title, kind, dayKey: null, mealType: null }
        : null;
    }
    if (kind === 'meal') {
      const name = mealsById.get(id)?.name;
      return name ? { name, kind, dayKey: null, mealType: null } : null;
    }
    const meal = planned.get(id);
    const name = meal
      ? getPlannedMealTitle(meal, recipesById, ingredientsById)
      : '';
    return meal && name
      ? {
          name,
          kind,
          dayKey: getPlannedDayKey(meal.date),
          mealType: meal.mealType,
        }
      : null;
  };

  const result = new Map(
    [...sources].flatMap((source) => {
      const label = getLabel(source);
      return label ? [[source, label] as const] : [];
    }),
  );
  return result;
}

/** "Thu dinner", "Oct 23 lunch": a planned meal's slot. */
export const formatSourceSlot = (
  label: Pick<ShoppingSourceLabel, 'dayKey' | 'mealType'>,
  todayKey: string,
) =>
  label.dayKey && label.mealType
    ? `${formatSourceDay(label.dayKey, todayKey)} ${MEAL_TYPE_LABELS[label.mealType].toLowerCase()}`
    : '';

/** Each found source's name as a list says it: a planned meal carries its day ("Adobo chicken (Thu)"), and its slot when two would otherwise read the same ("Adobo chicken (Thu dinner)"). */
export function getSourceNames(
  sources: string[],
  labels: Map<string, ShoppingSourceLabel>,
  todayKey: string,
): { source: string; name: string }[] {
  const found = sources.flatMap((source) => {
    const label = labels.get(source);
    return label ? [{ source, label }] : [];
  });
  const byDay = (label: ShoppingSourceLabel) =>
    label.dayKey
      ? `${label.name} (${formatSourceDay(label.dayKey, todayKey)})`
      : label.name;
  const counts = found.reduce(
    (acc, { label }) => acc.set(byDay(label), (acc.get(byDay(label)) ?? 0) + 1),
    new Map<string, number>(),
  );
  const result = found.map(({ source, label }) => ({
    source,
    name:
      label.dayKey && (counts.get(byDay(label)) ?? 0) > 1
        ? `${label.name} (${formatSourceSlot(label, todayKey)})`
        : byDay(label),
  }));
  return result;
}

/** "A", "A and B", "A, B and 3 more": names in full up to `limit`, then how many more. */
export const joinSourceNames = (names: string[], limit: number) => {
  if (names.length <= 1) return names[0] ?? '';
  const shown = names.slice(0, limit);
  const more = names.length - shown.length;
  return more > 0
    ? `${shown.join(', ')} and ${more} more`
    : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

/** What a line is for, by name: "Adobo chicken (Thu) and Cilantro lime rice (Fri)", two names then "and 3 more", or null when nothing behind it still resolves. */
export function getShoppingSourcesText(
  sources: string[],
  labels: Map<string, ShoppingSourceLabel>,
  todayKey: string,
  limit = MAX_SOURCE_NAMES_SHOWN,
): string | null {
  const names = getSourceNames(sources, labels, todayKey).map(
    ({ name }) => name,
  );
  return names.length === 0 ? null : joinSourceNames(names, limit);
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

/** Like `mergeLines`, and each item keeps every source behind its lines, in the order they came. */
export function mergeSourcedLines(lines: SourcedLine[]): ListLine[] {
  const sums = lines.reduce((acc, line) => {
    const id = getShoppingItemId(line.ingredientId, line.unit);
    const known = acc.get(id);
    const sources = known?.sources ?? [];
    return acc.set(id, {
      ingredientId: line.ingredientId,
      unit: line.unit,
      amount: known ? addAmounts(known.amount, line.amount) : line.amount,
      sources:
        !line.source || sources.includes(line.source)
          ? sources
          : [...sources, line.source],
    });
  }, new Map<string, ListLine>());

  const merged = [...sums.values()].flatMap((line): ListLine[] => {
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
  const isAbsorbed = (line: ListLine) =>
    line.amount === null && withAmount.has(line.ingredientId);
  const absorbedSources = new Map(
    merged
      .filter(isAbsorbed)
      .map((line) => [line.ingredientId, line.sources] as const),
  );
  return merged
    .filter((line) => !isAbsorbed(line))
    .map((line) => {
      const extra = absorbedSources.get(line.ingredientId);
      return extra
        ? { ...line, sources: [...new Set([...line.sources, ...extra])] }
        : line;
    });
}

/** An item's sources after an add: the added ones move to the end, and past the cap the oldest are let go. */
export function mergeSources(
  existing: readonly string[],
  added: readonly string[],
): string[] {
  const fresh = [...new Set(added)];
  const kept = [...new Set(existing)].filter(
    (source) => !fresh.includes(source),
  );
  const result = [...kept, ...fresh].slice(-MAX_SHOPPING_SOURCES);
  return result;
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

const getItemRawLines = (
  item: MealItem,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): ShoppingLine[] => {
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
};

/** The lines of a meal or a day: a recipe item scales its recipe by its servings, an ingredient item is its servings of one serving size. */
export function getItemsLines(
  items: MealItem[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): ShoppingLine[] {
  return mergeLines(
    items.flatMap((item) =>
      getItemRawLines(item, recipesById, ingredientsById),
    ),
  );
}

export interface SourcedItems {
  items: MealItem[];
  source: string | null;
}

/** Each group's lines tagged with its source, summed per ingredient, unit and source but left unrounded, so amounts that meet on one item round once. */
export function getSourcedLines(
  groups: SourcedItems[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): SourcedLine[] {
  const sums = groups
    .flatMap(({ items, source }) =>
      items
        .flatMap((item) => getItemRawLines(item, recipesById, ingredientsById))
        .map((line) => ({ ...line, source })),
    )
    .reduce((acc, line) => {
      const key = `${getShoppingItemId(line.ingredientId, line.unit)}|${line.source ?? ''}`;
      const known = acc.get(key);
      return acc.set(key, {
        ...line,
        amount: known ? addAmounts(known.amount, line.amount) : line.amount,
      });
    }, new Map<string, SourcedLine>());

  const result = [...sums.values()].filter(
    (line) =>
      line.amount === null ||
      (Number.isFinite(line.amount) && roundAmount(line.amount) > 0),
  );
  return result;
}

export interface DayOnList {
  /** Every planned meal with something to buy has already put a line on the list. */
  isListed: boolean;
  /** The rows the day's add sheet would start unticked, of all its rows. */
  coveredCount: number;
  rowCount: number;
}

/** Whether a day's planned meals are on the list, counted the way its add sheet ticks them. */
export function getDayOnList(
  meals: PlannedMeal[],
  items: ShoppingItem[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): DayOnList {
  const lines = getSourcedLines(
    meals.map((meal) => ({ items: meal.items, source: meal.id })),
    recipesById,
    ingredientsById,
  );
  const rows = groupShopLines(lines, ingredientsById);
  const itemsByRow = getItemsByRow(rows, items);
  const listed = new Set(items.flatMap((item) => item.sources ?? []));
  const mealIds = [...new Set(lines.flatMap((line) => line.source ?? []))];

  return {
    isListed: mealIds.length > 0 && mealIds.every((id) => listed.has(id)),
    coveredCount: rows.filter(
      (row) => getRowOnList(row.lines, itemsByRow.get(row.id) ?? []).isCovered,
    ).length,
    rowCount: rows.length,
  };
}

export interface ShoppingSourceContext {
  plannedById: Map<string, PlannedMeal>;
  mealsById: Map<string, Meal>;
  recipesById: Map<string, Recipe>;
  ingredientsById: Map<string, ResolvedIngredient>;
}

/** What a source asks of the list now, worked out the way its add was: a planned meal's or a saved meal's items as they are, a recipe at its own servings (the servings an add picked aren't kept). Null when the source no longer resolves. */
export function getSourceLines(
  source: string,
  context: ShoppingSourceContext,
): ShoppingLine[] | null {
  const { kind, id } = parseShoppingSource(source);
  if (kind === 'recipe') {
    const recipe = context.recipesById.get(id);
    return recipe ? getRecipeLines(recipe, context.ingredientsById) : null;
  }
  const items =
    kind === 'meal'
      ? context.mealsById.get(id)?.items
      : context.plannedById.get(id)?.items;
  return items
    ? getSourcedLines(
        [{ items, source }],
        context.recipesById,
        context.ingredientsById,
      )
    : null;
}

const carries = (item: Pick<ShoppingItem, 'sources'>, source: string) =>
  (item.sources ?? []).includes(source);

/** How much of each item carrying `source` its lines account for, in the item's own unit: a line lands on the item of its ingredient and unit, else on one of the same ingredient and kind of unit (an amount the person moved to another unit). A line with no amount, and an item that is just the name, account for nothing. */
export function getSourceShares(
  source: string,
  lines: ShoppingLine[],
  items: ShoppingItem[],
): Map<string, number> {
  const carrying = items
    .filter((item) => item.amount !== null && carries(item, source))
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(carrying.map((item) => [item.id, item]));
  const result = lines.reduce((acc, line) => {
    if (line.amount === null) return acc;
    const exact = byId.get(getShoppingItemId(line.ingredientId, line.unit));
    const target =
      exact ??
      carrying.find(
        (item) =>
          item.ingredientId === line.ingredientId &&
          UNIT_DIMENSION[item.unit] === UNIT_DIMENSION[line.unit],
      );
    if (!target) return acc;
    const amount = exact
      ? line.amount
      : (line.amount * UNIT_TO_BASE[line.unit]) / UNIT_TO_BASE[target.unit];
    return acc.set(target.id, (acc.get(target.id) ?? 0) + amount);
  }, new Map<string, number>());
  return result;
}

/** For each item carrying `source`, what its other sources ask of it now, in its own unit; null when one of them no longer resolves, so the rest can't be known. */
export function getOtherShares(
  source: string,
  items: ShoppingItem[],
  context: ShoppingSourceContext,
): Map<string, number | null> {
  const carrying = items.filter((item) => carries(item, source));
  const others = [
    ...new Set(carrying.flatMap((item) => item.sources ?? [])),
  ].filter((other) => other !== source);
  const sharesBySource = new Map(
    others.map((other) => {
      const lines = getSourceLines(other, context);
      return [other, lines ? getSourceShares(other, lines, items) : null];
    }),
  );
  const result = new Map(
    carrying.map((item) => [
      item.id,
      (item.sources ?? [])
        .filter((other) => other !== source)
        .reduce<number | null>((sum, other) => {
          const shares = sharesBySource.get(other);
          return sum === null || !shares
            ? null
            : sum + (shares.get(item.id) ?? 0);
        }, 0),
    ]),
  );
  return result;
}

export interface StopEntry {
  id: string;
  /** The item as read; null for one this creates. */
  before: ShoppingItem | null;
  /** What it becomes; null deletes it. */
  after: ShoppingItem | null;
}

export interface StopPlan {
  entries: StopEntry[];
  /** Things to buy that came off the list. */
  removedCount: number;
  /** Things to buy that stay, smaller or as they were, because something else also wants them. */
  keptCount: number;
  /** Things already got, which only lose the tag. */
  gotCount: number;
}

/** The `EACH` item a line that is just the name lives on. */
export const getNameOnlyItemId = (ingredientId: string) =>
  getShoppingItemId(ingredientId, 'EACH');

/** Takes one source's share off the list. A got item only loses the tag; one to buy loses the share, and goes once nothing is left of it (an amount that reaches zero, or a name-only line nothing else wants). When the share runs past what is left (the meal grew, or the person lowered the amount) and something else wants the item, it keeps that one's share, never more than it had, or becomes just the name; something the person added on the list (no sources) never carries the tag, so it is never touched. `read` holds every item carrying the source and the name-only item of each ingredient, as read. */
export function planStopShopping(
  source: string,
  read: ShoppingItem[],
  shares: Map<string, number>,
  otherShares: Map<string, number | null>,
  now: number,
): StopPlan {
  const readById = new Map(read.map((item) => [item.id, item]));
  const carrying = read
    .filter((item) => carries(item, source))
    .sort(
      (a, b) =>
        Number(b.unit === 'EACH') - Number(a.unit === 'EACH') ||
        a.id.localeCompare(b.id),
    );

  const initial = {
    planned: new Map<string, ShoppingItem | null>(),
    removedCount: 0,
    keptCount: 0,
    gotCount: 0,
  };
  type Step = typeof initial;
  const current = (step: Step, id: string) =>
    step.planned.has(id)
      ? (step.planned.get(id) ?? null)
      : (readById.get(id) ?? null);

  const final = carrying.reduce((step, entry): Step => {
    const item = current(step, entry.id) ?? entry;
    const sources = (item.sources ?? []).filter((other) => other !== source);
    const write = (
      id: string,
      after: ShoppingItem | null,
      counted: 'removedCount' | 'keptCount' | 'gotCount',
    ) => ({
      ...step,
      planned: new Map(step.planned).set(id, after),
      [counted]: step[counted] + 1,
    });
    const keep = (amount: number | null) =>
      write(
        item.id,
        { ...item, amount, sources, updatedAt: now },
        item.isChecked ? 'gotCount' : 'keptCount',
      );

    if (item.isChecked) return keep(item.amount);
    if (item.amount === null) {
      return sources.length === 0
        ? write(item.id, null, 'removedCount')
        : keep(null);
    }
    const rest = roundAmount(item.amount - (shares.get(item.id) ?? 0));
    if (rest > 0) return keep(rest);
    if (sources.length === 0) return write(item.id, null, 'removedCount');
    const other = otherShares.get(item.id);
    if (other === undefined || other === null) return keep(item.amount);
    const otherAmount = roundAmount(other);
    if (otherAmount > 0) return keep(Math.min(item.amount, otherAmount));
    if (item.unit === 'EACH') return keep(null);

    const twinId = getNameOnlyItemId(item.ingredientId);
    const twin = current(step, twinId);
    const removed = write(item.id, null, 'keptCount');
    return {
      ...removed,
      planned: new Map(removed.planned).set(
        twinId,
        twin
          ? {
              ...twin,
              sources: mergeSources(twin.sources ?? [], sources),
              updatedAt: now,
            }
          : {
              id: twinId,
              ingredientId: item.ingredientId,
              amount: null,
              unit: 'EACH',
              isChecked: false,
              sources: mergeSources([], sources),
              createdAt: readById.get(twinId)?.createdAt ?? now,
              updatedAt: now,
            },
      ),
    };
  }, initial);

  const result: StopPlan = {
    entries: [...final.planned.entries()].map(([id, after]) => ({
      id,
      before: readById.get(id) ?? null,
      after,
    })),
    removedCount: final.removedCount,
    keptCount: final.keptCount,
    gotCount: final.gotCount,
  };
  return result;
}

/** Whether an item is still as a stop left it, so its Undo may put it back: still gone, or untouched since (the same `updatedAt`). */
export const isAsStopLeft = (
  current: Pick<ShoppingItem, 'updatedAt'> | null,
  after: Pick<ShoppingItem, 'updatedAt'> | null,
) => (after === null ? current === null : current?.updatedAt === after.updatedAt);

export interface ShoppingMeal {
  source: string;
  label: ShoppingSourceLabel;
  /** Rows of the list it put something on, drawn the way the list draws them, and how many of those are still to buy. */
  rowCount: number;
  openCount: number;
  isPast: boolean;
}

const MEAL_TYPE_INDEX = new Map(MEAL_TYPES.map((type, index) => [type, index]));

const getRowsBySource = (side: ShoppingItem[]) => {
  const rowIds = getItemRowIds(side);
  return side.reduce((acc, item) => {
    (item.sources ?? []).forEach((source) =>
      acc.set(
        source,
        (acc.get(source) ?? new Set<string>()).add(rowIds.get(item.id) ?? ''),
      ),
    );
    return acc;
  }, new Map<string, Set<string>>());
};

/** What the list is for: every source behind it that still resolves, planned meals by day (the ones that have passed first) and meal, then recipes and saved meals by name. */
export function getShoppingMeals(
  items: ShoppingItem[],
  labels: Map<string, ShoppingSourceLabel>,
  todayKey: string,
): ShoppingMeal[] {
  const open = getRowsBySource(items.filter((item) => !item.isChecked));
  const got = getRowsBySource(items.filter((item) => item.isChecked));
  const meals = [...labels.entries()].map(
    ([source, label]): ShoppingMeal => {
      const openCount = open.get(source)?.size ?? 0;
      return {
        source,
        label,
        rowCount: openCount + (got.get(source)?.size ?? 0),
        openCount,
        isPast: label.dayKey !== null && label.dayKey < todayKey,
      };
    },
  );
  const sortKey = ({ label }: ShoppingMeal) =>
    label.dayKey === null
      ? `1|${label.name.toLowerCase()}`
      : `0|${label.dayKey}|${MEAL_TYPE_INDEX.get(label.mealType ?? 'DINNER') ?? 0}|${label.name.toLowerCase()}`;
  const result = meals
    .filter((meal) => meal.rowCount > 0)
    .sort(
      (a, b) =>
        sortKey(a).localeCompare(sortKey(b)) || a.source.localeCompare(b.source),
    );
  return result;
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

/** The items an add sheet's row stands for: its own row's, or for a row that is just the name, the row the list draws for that ingredient. Pass the items of one side of the list, or all of them. */
export function getItemsByRow(
  rows: Pick<ShopLineRow, 'id' | 'ingredientId' | 'lines'>[],
  items: ShoppingItem[],
): Map<string, ShoppingItem[]> {
  const rowIds = getItemRowIds(items);
  const amountRows = getAmountRows(items);
  const byDrawnRow = groupByRow(items, (item) => rowIds.get(item.id) ?? '');
  const byRow = groupByRow(items, (item) =>
    getShopRowId(item.ingredientId, item.unit),
  );
  const nameOnlyByIngredient = groupByRow(
    items.filter((item) => item.amount === null),
    (item) => item.ingredientId,
  );
  const getJoined = (
    row: Pick<ShopLineRow, 'id' | 'ingredientId' | 'lines'>,
  ) => {
    if (row.lines.every((line) => line.amount === null)) {
      return byDrawnRow.get(amountRows.get(row.ingredientId) ?? row.id);
    }
    const hasNameOnlyLine = row.lines.some((line) => line.amount === null);
    const own = byRow.get(row.id) ?? [];
    return hasNameOnlyLine
      ? [
          ...new Set([
            ...own,
            ...(nameOnlyByIngredient.get(row.ingredientId) ?? []),
          ]),
        ]
      : own;
  };
  const result = new Map(
    rows.flatMap((row) => {
      const joined = getJoined(row);
      return joined && joined.length > 0 ? [[row.id, joined] as const] : [];
    }),
  );
  return result;
}

/** What is still to buy of each add sheet row. */
export const getOpenItemsByRow = (
  rows: Pick<ShopLineRow, 'id' | 'ingredientId' | 'lines'>[],
  items: ShoppingItem[],
) =>
  getItemsByRow(
    rows,
    items.filter((item) => !item.isChecked),
  );

/** Groups what is left and what is checked off, each by the section of the shop it is found in, in walking order with Other last, one row per ingredient and kind of unit. A row in `held` is drawn where it was (true is "Got it") while its own `isChecked` is the stored truth. */
export function groupShoppingItems(
  items: ShoppingItem[],
  ingredientsById: Map<string, ResolvedIngredient>,
  held: ReadonlyMap<string, boolean> = new Map(),
): Record<ShoppingHalf, ShoppingGroup[]> {
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
        sources: [...new Set(byBase.flatMap((item) => item.sources ?? []))],
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

/** The view the list shows: the person's pick, unless they picked one half and what was typed since then matches nothing there and something in the other half. All shows both halves, so it is always kept. */
export function getShownShoppingView(
  pick: { view: ShoppingView; query: string },
  query: string,
  matches: Record<ShoppingHalf, number>,
): ShoppingView {
  if (pick.view === 'all') return 'all';

  const other: ShoppingHalf = pick.view === 'toBuy' ? 'got' : 'toBuy';
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
