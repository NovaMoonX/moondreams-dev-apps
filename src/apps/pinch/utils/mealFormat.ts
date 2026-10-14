import { formatDateShort } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type {
  MealItem,
  PlannedSnapshot,
  Recipe,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { getRepricedAt } from '@apps/pinch/utils/mealMath';

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
