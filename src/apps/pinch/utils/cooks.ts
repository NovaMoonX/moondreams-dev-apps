import { toDateInputValue } from '@/utils/dateInputUtils';
import {
  MAX_COOK_TIMERS,
  MAX_COOKED_SERVINGS,
  MIN_COOK_SERVINGS,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import type {
  Cook,
  MealItem,
  PlateCookRecipe,
  Recipe,
} from '@apps/pinch/types';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';

export interface CookSummary {
  count: number;
  lastCookedAt: number;
}

export interface MarkableRecipe {
  recipe: Recipe;
  servings: number;
}

export const getCookId = (plannedMealId: string, recipeId: string) =>
  `${plannedMealId}__${recipeId}`;

/** The cook that cooking started from a planned meal marks, null for any other start. */
export const getPlannedCookId = (
  plannedMealId: string | null,
  recipeId: string,
) => (plannedMealId === null ? null : getCookId(plannedMealId, recipeId));

const byNewest = (a: Cook, b: Cook) =>
  b.cookedAt - a.cookedAt ||
  b.createdAt - a.createdAt ||
  a.id.localeCompare(b.id);

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

export const getCookSummaries = (cooks: Cook[]) => {
  const result = cooks.reduce((summaries, cook) => {
    const known = summaries.get(cook.recipeId);
    summaries.set(cook.recipeId, {
      count: (known?.count ?? 0) + 1,
      lastCookedAt: Math.max(known?.lastCookedAt ?? -Infinity, cook.cookedAt),
    });
    return summaries;
  }, new Map<string, CookSummary>());

  return result;
};

export const isCookHistoryFull = (count: number) =>
  count >= SOFT_MAX_COOKS_PER_RECIPE;

export const isValidCookServings = (servings: number) =>
  Number.isFinite(servings) && servings > 0 && servings <= MAX_COOKED_SERVINGS;

/** Now on today, local noon on a day already past, null on a day still ahead. */
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
          MAX_COOKED_SERVINGS,
          (acc.get(recipe.id)?.servings ?? 0) + item.servings,
        ),
      });
    }
    return acc;
  }, new Map<string, MarkableRecipe>());

  return [...byRecipe.values()];
};

export const mergePlannedCook = (existing: Cook | null, incoming: Cook) =>
  existing === null
    ? { isNew: true, cook: incoming }
    : { isNew: false, cook: existing };

/** The rules want every key on the merged document, so an edit writes back the one an older cook lacks. */
export const getMissingCookFields = (existing: object) =>
  'plannedMealId' in existing ? {} : { plannedMealId: null };

export const getCookServings = (servings: number) =>
  servings > 0 ? Math.min(servings, MAX_COOKED_SERVINGS) : 1;

/** What cooking starts at: the recipe as written, or the plan's count when it asks for more than the recipe makes. */
export const getCookStartServings = (
  recipeServings: number,
  plannedServings: number | null,
) =>
  Math.min(
    MAX_COOKED_SERVINGS,
    Math.max(recipeServings > 0 ? recipeServings : 1, plannedServings ?? 0),
  );

/** Where one recipe of a cooking session is: the step on screen, its servings and what has been ticked as got out. */
export interface PlateCookState {
  stepIndex: number;
  servings: number;
  gotOut: Record<string, boolean>;
}

/** The recipes a planned plate cooks together: each one with steps among `cookRecipeIds`, once, in plate order, with the servings its items plan for tonight. */
export const getPlateCookRecipes = (
  items: Pick<MealItem, 'kind' | 'refId' | 'servings'>[],
  recipesById: Map<string, Pick<Recipe, 'steps'>>,
  cookRecipeIds: string[],
) => {
  const allowed = new Set(cookRecipeIds);
  const byRecipe = items.reduce((acc, item) => {
    const recipe =
      item.kind === 'RECIPE' && allowed.has(item.refId)
        ? recipesById.get(item.refId)
        : undefined;
    if (recipe && recipe.steps.length > 0) {
      acc.set(
        item.refId,
        Math.min(
          MAX_COOKED_SERVINGS,
          (acc.get(item.refId) ?? 0) + item.servings,
        ),
      );
    }
    return acc;
  }, new Map<string, number>());

  const result: PlateCookRecipe[] = [...byRecipe].map(
    ([recipeId, servings]) => ({ recipeId, servings }),
  );
  return result;
};

/** Every recipe of a session starts on its first step with nothing ticked, at its own servings (or the plan's when that is more). */
export const getPlateStart = (
  entries: {
    recipeId: string;
    recipeServings: number;
    plannedServings: number | null;
  }[],
) => {
  const result: Record<string, PlateCookState> = Object.fromEntries(
    entries.map(({ recipeId, recipeServings, plannedServings }) => [
      recipeId,
      {
        stepIndex: 0,
        servings: getCookStartServings(recipeServings, plannedServings),
        gotOut: {},
      },
    ]),
  );
  return result;
};

/** A timer's name: its step's first words, after its recipe's name when the session cooks several. */
export const getTimerCaption = (timer: {
  stepName: string;
  recipeTitle: string | null;
}) =>
  timer.recipeTitle === null
    ? timer.stepName
    : `${timer.recipeTitle} · ${timer.stepName}`;

/** Running and paused timers count against the session's cap; a finished one waits for Dismiss and doesn't. */
export const countLiveTimers = (timers: { status: string }[]) =>
  timers.filter((timer) => timer.status !== 'done').length;

export const canStartTimer = (timers: { status: string }[]) =>
  countLiveTimers(timers) < MAX_COOK_TIMERS;

/** A whole serving a tap, and a half only below one. */
export const stepCookServings = (current: number, direction: 1 | -1) => {
  if (direction === 1) {
    return Math.min(
      MAX_COOKED_SERVINGS,
      current < 1 ? 1 : Math.floor(current) + 1,
    );
  }
  const next = Math.ceil(current) - 1;
  return next >= 1 ? next : MIN_COOK_SERVINGS;
};

const TRAILING_LITTLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** A step's first few words ("Brown the beef"), so two timers are told apart by what is cooking. */
export const getStepName = (step: string) => {
  const words = step
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const kept = words.reduceRight<string[]>(
    (acc, word) =>
      acc.length === 0 && TRAILING_LITTLE_WORDS.has(word.toLowerCase())
        ? acc
        : [word, ...acc],
    [],
  );

  return kept.join(' ');
};
