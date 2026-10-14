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
