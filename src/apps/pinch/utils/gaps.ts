import type { Gap } from '@apps/pinch/types';

/** How many distinct ingredients a list of gaps leaves out. */
export const countLeftOutIngredients = (gaps: Gap[]) =>
  new Set(gaps.map((gap) => gap.ingredientId)).size;

/** "leaves out 2 ingredients". */
export function formatLeftOut(gaps: Gap[]): string {
  const count = countLeftOutIngredients(gaps);
  return `leaves out ${count} ${count === 1 ? 'ingredient' : 'ingredients'}`;
}
