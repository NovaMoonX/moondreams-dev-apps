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

/** A planned meal's name when it came from a saved meal, else its first item and how many more follow. */
export function getPlannedMealTitle(
  meal: Pick<PlannedMeal, 'name' | 'items'>,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): string {
  const name = meal.name?.trim();
  if (name) {
    return name;
  }

  if (meal.items.length === 0) {
    return '';
  }

  const first = getItemTitle(meal.items[0], recipesById, ingredientsById);
  const title =
    meal.items.length > 1 ? `${first} +${meal.items.length - 1}` : first;
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

/** A row's price, or in a few words why it has none ("Wasn't priced" once its day has passed, "Still no price" once that day was priced again). */
export const formatRowCost = (
  cents: number | null | undefined,
  isFrozen: boolean,
  isRepriced = false,
) => {
  if (cents != null) return formatCost(cents);
  if (!isFrozen) return 'No price yet';
  return isRepriced ? 'Still no price' : "Wasn't priced";
};

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

/** A cost tile's figure: "so far" while its gaps can still be priced, "Not priced" for a fixed day that had no price. */
export const formatCostTile = (
  cents: number | null,
  leftOutCount: number,
  isFrozen: boolean,
) => {
  if (cents === null) return isFrozen ? 'Not priced' : 'No price yet';
  return leftOutCount > 0 && !isFrozen
    ? `${formatCost(cents)} so far`
    : formatCost(cents);
};
