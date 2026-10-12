import type { Recipe } from '@apps/pinch/types';

/** "45 min", "1 h", "1 h 15 min". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** Prep and cook time added together, or null when the recipe gives neither. */
export function getTotalMinutes(
  recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>,
): number | null {
  const prep = recipe.prepMinutes ?? null;
  const cook = recipe.cookMinutes ?? null;
  return prep === null && cook === null ? null : (prep ?? 0) + (cook ?? 0);
}

/** "4 servings", "1 serving", "1.5 servings". */
export function formatServings(servings: number): string {
  return `${servings} ${servings === 1 ? 'serving' : 'servings'}`;
}
