import type { ItemKind, MealType } from '@apps/pinch/types';
import {
  addDaysToKey,
  DAY_MS,
  formatDayTitle,
  getDateOfDayKey,
} from '@apps/pinch/utils/dayKeys';
import { isStarred, sortFavoritesFirst } from '@apps/pinch/utils/favorites';

/** Today and the six days after it: the days the plan builder offers as pills. */
export const NEAR_DAY_COUNT = 7;

const MAIN_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER'];

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
});

/** "today", "tomorrow", a weekday ("Thu") for the rest of the coming week, else "Tue, Nov 3". */
export function getPlanDayWord(dayKey: string, todayKey: string) {
  const offset = Math.round(
    (getDateOfDayKey(dayKey) - getDateOfDayKey(todayKey)) / DAY_MS,
  );
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  if (offset > 1 && offset < NEAR_DAY_COUNT) {
    return weekdayFormatter.format(getDateOfDayKey(dayKey));
  }
  return formatDayTitle(dayKey);
}

/** The near days as pill options: "Today", "Tomorrow", then weekday names. */
export function getNearDayOptions(todayKey: string) {
  const result = Array.from({ length: NEAR_DAY_COUNT }, (_, index) => {
    const value = addDaysToKey(todayKey, index);
    const word = getPlanDayWord(value, todayKey);
    return { value, label: word.charAt(0).toUpperCase() + word.slice(1) };
  });
  return result;
}

const getClockMeal = (hour: number): MealType => {
  if (hour < 10) return 'BREAKFAST';
  if (hour < 15) return 'LUNCH';
  return 'DINNER';
};

/** A new plan's meal: the clock's on today (breakfast before 10, lunch before 3 pm, else dinner), dinner on other days, moved to the nearest main meal that day doesn't have yet. */
export function getDefaultMealType(
  plannedTypes: readonly MealType[],
  isToday: boolean,
  hour: number,
): MealType {
  const start = isToday ? getClockMeal(hour) : 'DINNER';
  const index = MAIN_MEALS.indexOf(start);
  const nearestFirst = [
    ...MAIN_MEALS.slice(index),
    ...MAIN_MEALS.slice(0, index).reverse(),
  ];
  const result =
    nearestFirst.find((type) => !plannedTypes.includes(type)) ?? start;
  return result;
}

const getDayText = (dayKey: string, todayKey: string) => {
  const offset = Math.round(
    (getDateOfDayKey(dayKey) - getDateOfDayKey(todayKey)) / DAY_MS,
  );
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return formatDayTitle(dayKey);
};

/** The builder's "When" row: "Today · 🍝 Dinner", "Tomorrow · …", else "Sat, Oct 24 · …". */
export function getWhenSummary(
  dayKey: string,
  todayKey: string,
  meal: { label: string; emoji: string },
) {
  const result = `${getDayText(dayKey, todayKey)} · ${meal.emoji} ${meal.label}`;
  return result;
}

interface BuilderSnapshotState {
  items: readonly { kind: ItemKind; refId: string; servings: number }[];
  name: string;
  /** What a planned meal is moved by (its day and meal), or null where only the plate and name count. */
  when: string | null;
}

/** What a builder holds as one string, so a screen can tell whether anything changed since it opened. */
export function getBuilderSnapshot({
  items,
  name,
  when,
}: BuilderSnapshotState) {
  const result = JSON.stringify([
    items.map(({ kind, refId, servings }) => [kind, refId, servings]),
    name.trim(),
    when,
  ]);
  return result;
}

interface BuilderNoteState {
  mode: 'plan' | 'meal';
  hasName: boolean;
  hasDay: boolean;
  hasItems: boolean;
}

/** What the builder's footer says while its primary is off, or null when nothing is missing. */
export function getBuilderNote({
  mode,
  hasName,
  hasDay,
  hasItems,
}: BuilderNoteState): string | null {
  if (mode === 'meal') {
    if (!hasName && !hasItems) return 'Add a name and something for the plate';
    if (!hasName) return 'Add a name first';
    return hasItems ? null : 'Add something for the plate';
  }
  if (!hasDay && !hasItems) return 'Pick a day and add something for the plate';
  if (!hasDay) return 'Pick a day first';
  return hasItems ? null : 'Add something for the plate';
}

/** Recent rows shown before "Show N more": six, or all of them when folding would hide only a few. */
export const COLLAPSED_RECENT_ROWS = 6;
const MAX_QUIET_HIDDEN_ROWS = 3;

/** `openingTotal` is how many rows there were when the screen opened: a fold drawn then stays until nothing is tucked away, so a pick never makes hidden rows appear at once. */
export function getRecentRowWindow(
  total: number,
  isExpanded: boolean,
  openingTotal = total,
) {
  const hasToggle =
    openingTotal > COLLAPSED_RECENT_ROWS + MAX_QUIET_HIDDEN_ROWS &&
    total > COLLAPSED_RECENT_ROWS;
  const shown = hasToggle && !isExpanded ? COLLAPSED_RECENT_ROWS : total;
  return { shown, hasToggle };
}

/** The picks worth offering while a plate is built: a recipe already on it is left out, and so is a saved meal whose items all are. */
export function getOfferablePicks(
  picks: readonly RecentPick[],
  plateRefIds: ReadonlySet<string>,
  mealItemIds: ReadonlyMap<string, readonly string[]>,
) {
  const result = picks.filter((pick) =>
    pick.kind === 'RECIPE'
      ? !plateRefIds.has(pick.id)
      : (mealItemIds.get(pick.id) ?? []).some((id) => !plateRefIds.has(id)),
  );
  return result;
}

export interface RecentPick {
  kind: 'RECIPE' | 'MEAL';
  id: string;
  label: string;
  at: number;
  /** A starred saved meal; recipes are never starred. */
  isFavorite?: boolean;
}

interface RecentPickSources {
  recipes: readonly { id: string; title: string; createdAt: number }[];
  meals: readonly {
    id: string;
    name: string;
    createdAt: number;
    isFavorite?: boolean;
  }[];
  plannedMeals: readonly {
    createdAt: number;
    sourceMealId: string | null;
    items: readonly { kind: ItemKind; refId: string }[];
  }[];
  cookSummaries: ReadonlyMap<string, { lastCookedAt: number }>;
}

/** Recipes and saved meals, the most recently planned, cooked or made first, with starred saved meals ahead of them. */
export function rankRecentPicks({
  recipes,
  meals,
  plannedMeals,
  cookSummaries,
}: RecentPickSources): RecentPick[] {
  const lastPlannedAt = plannedMeals.reduce((latest, plan) => {
    const keys = [
      ...plan.items
        .filter((item) => item.kind === 'RECIPE')
        .map((item) => `RECIPE:${item.refId}`),
      ...(plan.sourceMealId ? [`MEAL:${plan.sourceMealId}`] : []),
    ];
    keys.forEach((key) =>
      latest.set(key, Math.max(latest.get(key) ?? -Infinity, plan.createdAt)),
    );
    return latest;
  }, new Map<string, number>());
  const picks: RecentPick[] = [
    ...recipes.map((recipe) => ({
      kind: 'RECIPE' as const,
      id: recipe.id,
      label: recipe.title,
      at: Math.max(
        recipe.createdAt,
        lastPlannedAt.get(`RECIPE:${recipe.id}`) ?? -Infinity,
        cookSummaries.get(recipe.id)?.lastCookedAt ?? -Infinity,
      ),
    })),
    ...meals.map((meal) => ({
      kind: 'MEAL' as const,
      id: meal.id,
      label: meal.name,
      isFavorite: isStarred(meal),
      at: Math.max(
        meal.createdAt,
        lastPlannedAt.get(`MEAL:${meal.id}`) ?? -Infinity,
      ),
    })),
  ];
  const seen = new Set<string>();
  const result = sortFavoritesFirst(
    picks
      .filter((pick) => {
        const key = `${pick.kind}:${pick.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.at - a.at || a.label.localeCompare(b.label)),
  );
  return result;
}
