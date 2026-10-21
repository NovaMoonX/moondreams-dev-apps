import type { ItemKind, MealType } from '@apps/pinch/types';
import {
  addDaysToKey,
  DAY_MS,
  formatDayTitle,
  getDateOfDayKey,
} from '@apps/pinch/utils/dayKeys';

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

export interface RecentPick {
  kind: 'RECIPE' | 'MEAL';
  id: string;
  label: string;
  at: number;
}

interface RecentPickSources {
  recipes: readonly { id: string; title: string; createdAt: number }[];
  meals: readonly { id: string; name: string; createdAt: number }[];
  plannedMeals: readonly {
    createdAt: number;
    sourceMealId: string | null;
    items: readonly { kind: ItemKind; refId: string }[];
  }[];
  cookSummaries: ReadonlyMap<string, { lastCookedAt: number }>;
}

/** Recipes and saved meals, the most recently planned, cooked or made first. */
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
      at: Math.max(
        meal.createdAt,
        lastPlannedAt.get(`MEAL:${meal.id}`) ?? -Infinity,
      ),
    })),
  ];
  const result = picks.sort(
    (a, b) => b.at - a.at || a.label.localeCompare(b.label),
  );
  return result;
}
