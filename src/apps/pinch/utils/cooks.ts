import { toDateInputValue } from '@/utils/dateInputUtils';
import {
  MAX_COOK_SERVINGS,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import type { Cook, MealItem, Recipe } from '@apps/pinch/types';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';

export interface CookSummary {
  count: number;
  lastCookedAt: number;
}

export interface MarkableRecipe {
  recipe: Recipe;
  servings: number;
}

/** The one cook a planned meal can have for a recipe, so marking it again finds the first. */
export const getCookId = (plannedMealId: string, recipeId: string) =>
  `${plannedMealId}__${recipeId}`;

const byNewest = (a: Cook, b: Cook) =>
  b.cookedAt - a.cookedAt ||
  b.createdAt - a.createdAt ||
  a.id.localeCompare(b.id);

/** Each recipe's cooks, newest first. */
export const groupCooksByRecipe = (cooks: Cook[]) => {
  const result = [...cooks].sort(byNewest).reduce((byRecipe, cook) => {
    const list = byRecipe.get(cook.recipeId);
    if (list) {
      list.push(cook);
    } else {
      byRecipe.set(cook.recipeId, [cook]);
    }
    return byRecipe;
  }, new Map<string, Cook[]>());

  return result;
};

/** How many times each recipe was cooked and when last, in one pass over every cook. */
export const getCookSummaries = (cooks: Cook[]) => {
  const result = cooks.reduce((summaries, cook) => {
    const known = summaries.get(cook.recipeId);
    summaries.set(cook.recipeId, {
      count: (known?.count ?? 0) + 1,
      lastCookedAt: Math.max(known?.lastCookedAt ?? 0, cook.cookedAt),
    });
    return summaries;
  }, new Map<string, CookSummary>());

  return result;
};

/** "Cooked 3 times · last Oct 12", or "Cooked once · Oct 12". */
export const getCookFactText = (count: number, lastText: string) =>
  count === 1
    ? `Cooked once · ${lastText}`
    : `Cooked ${count} times · last ${lastText}`;

export const isCookHistoryFull = (count: number) =>
  count >= SOFT_MAX_COOKS_PER_RECIPE;

export const isValidCookServings = (servings: number) =>
  Number.isFinite(servings) && servings > 0 && servings <= MAX_COOK_SERVINGS;

/** When a planned meal's cook happened: now on today, local noon on a day already past, and null on a day still ahead (nothing to mark yet). */
export const getPlannedCookedAt = (plannedDate: number, now = Date.now()) => {
  const today = getLocalTodayDate(now);
  if (plannedDate > today) return null;
  if (plannedDate === today) return now;

  const [year, month, day] = toDateInputValue(plannedDate)
    .split('-')
    .map(Number);
  const result = new Date(year, month - 1, day, 12).getTime();

  return result;
};

/** The recipes of a planned meal that can be marked, one per recipe (a recipe listed twice adds up its servings), in the order they first appear. A recipe that isn't in the kitchen is left out. */
export const getMarkableRecipes = (
  items: MealItem[],
  recipesById: Map<string, Recipe>,
) => {
  const byRecipe = items.reduce((acc, item) => {
    const recipe = item.kind === 'RECIPE' ? recipesById.get(item.refId) : null;
    if (recipe) {
      acc.set(recipe.id, {
        recipe,
        servings: Math.min(
          MAX_COOK_SERVINGS,
          (acc.get(recipe.id)?.servings ?? 0) + item.servings,
        ),
      });
    }
    return acc;
  }, new Map<string, MarkableRecipe>());

  return [...byRecipe.values()];
};

/** Marking a planned meal again leaves the first cook exactly as it was. */
export const mergePlannedCook = (existing: Cook | null, incoming: Cook) =>
  existing === null
    ? { isNew: true, cook: incoming }
    : { isNew: false, cook: existing };

/** The keys an older cook may lack, as the null they read as, so an edit writes a whole document. */
export const getMissingCookFields = (existing: object) =>
  'plannedMealId' in existing ? {} : { plannedMealId: null };

/** The servings a cook starts at: the recipe's own, kept inside what a cook can hold. */
export const getCookServings = (servings: number) =>
  servings > 0 ? Math.min(servings, MAX_COOK_SERVINGS) : 1;
