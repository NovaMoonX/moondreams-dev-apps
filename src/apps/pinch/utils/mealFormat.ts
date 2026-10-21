import { formatDateShort } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type {
  MealItem,
  PlannedMeal,
  PlannedSnapshot,
  Recipe,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { getRepricedAt, type RepricePreview } from '@apps/pinch/utils/mealMath';

/** A meal item's name; a recipe or ingredient that is gone reads as removed. */
export function getItemTitle(
  item: Pick<MealItem, 'kind' | 'refId'>,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): string {
  if (item.kind === 'RECIPE') {
    return recipesById.get(item.refId)?.title ?? 'Removed recipe';
  }

  return ingredientsById.get(item.refId)?.name ?? 'Removed ingredient';
}

const MAX_NAMED_ITEM_LENGTH = 30;

/** An unnamed plate's title from its items' names: "A & B", "A, B and C", "A, B and 2 more", or "A & 2 more" once a name runs past 30 characters, with "N more" never split across lines; `namedCount` is how many it names. */
export function getPlateTitle(names: string[]): {
  title: string;
  namedCount: number;
} {
  const isShort = (list: string[]) =>
    list.every((name) => name.length <= MAX_NAMED_ITEM_LENGTH);
  const more = (count: number) => `${count}\u00a0more`;
  if (names.length <= 1) {
    return { title: names[0] ?? '', namedCount: names.length };
  }
  if (names.length === 2 && isShort(names)) {
    return { title: `${names[0]} & ${names[1]}`, namedCount: 2 };
  }
  if (names.length === 3 && isShort(names)) {
    return {
      title: `${names[0]}, ${names[1]} and ${names[2]}`,
      namedCount: 3,
    };
  }
  if (names.length > 2 && isShort(names.slice(0, 2))) {
    return {
      title: `${names[0]}, ${names[1]} and\u00a0${more(names.length - 2)}`,
      namedCount: 2,
    };
  }
  return {
    title: `${names[0]} &\u00a0${more(names.length - 1)}`,
    namedCount: 1,
  };
}

/** A planned meal's name when it came from a saved meal, else its plate's title from its items. */
export function getPlannedMealTitle(
  meal: Pick<PlannedMeal, 'name' | 'items'>,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): string {
  const name = meal.name?.trim();
  if (name) {
    return name;
  }

  const { title } = getPlateTitle(
    meal.items.map((item) => getItemTitle(item, recipesById, ingredientsById)),
  );
  return title;
}

/** Unrounded cents as dollars, rounded once here. */
export const formatCost = (cents: number) => formatCents(Math.round(cents));

/** What a fixed day's cost tile says about when its prices were set. */
export function getFixedNote(snapshots: PlannedSnapshot[]): string {
  const dates = snapshots.flatMap((snapshot) => getRepricedAt(snapshot) ?? []);
  if (dates.length === 0) {
    return 'Fixed when the day passed';
  }

  const day = formatDateShort(Math.max(...dates));
  return dates.length === snapshots.length
    ? `Priced with today's prices on ${day}`
    : `Some meals priced with today's prices on ${day}`;
}

/** The lines a re-price confirm shows: the day before and after in the cost tile's own words, and what stays unpriced. The "after" is "about" because the write re-reads the meals. */
export function getRepriceLines(preview: RepricePreview) {
  const { beforeCents, afterCents, leftOutCount } = preview;
  const before = beforeCents === null ? 'Not priced' : formatCost(beforeCents);
  const after =
    afterCents === null ? 'Still no price' : `about ${formatCost(afterCents)}`;
  const leftOut =
    leftOutCount === 0
      ? null
      : `${leftOutCount} ${leftOutCount === 1 ? 'ingredient still has' : 'ingredients still have'} no price`;

  return { before, after, leftOut };
}

/** A row's price in the shared words: "$0.08+" when it leaves something out, "—" when nothing is priced. */
export const formatRowPrice = (
  cents: number | null | undefined,
  isPartial: boolean,
) => {
  if (cents == null) return '—';
  return isPartial ? `${formatCost(cents)}+` : formatCost(cents);
};

/** A cost tile's figure: "so far" while its gaps can still be priced, "$0.15+" once the day is fixed, "Not priced" for a fixed day that had no price. */
export const formatCostTile = (
  cents: number | null,
  leftOutCount: number,
  isFrozen: boolean,
) => {
  if (cents === null) return isFrozen ? 'Not priced' : 'No price yet';
  if (leftOutCount === 0) return formatCost(cents);
  return isFrozen ? `${formatCost(cents)}+` : `${formatCost(cents)} so far`;
};
