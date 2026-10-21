import { formatCents } from '@/utils/moneyUtils';
import type { MealItem, Recipe, ResolvedIngredient } from '@apps/pinch/types';

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
