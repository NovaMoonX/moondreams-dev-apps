import type { ItemKind } from '@apps/pinch/types';

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
