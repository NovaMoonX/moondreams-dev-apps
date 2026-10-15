import type { Gap } from '@apps/pinch/types';

/** How many distinct ingredients a list of gaps leaves out. */
export const countLeftOutIngredients = (gaps: Gap[]) =>
  new Set(gaps.map((gap) => gap.ingredientId)).size;

/** "leaves out 2 ingredients". */
export function formatLeftOut(gaps: Gap[]): string {
  const count = countLeftOutIngredients(gaps);
  return `leaves out ${count} ${count === 1 ? 'ingredient' : 'ingredients'}`;
}

const GAP_KINDS: Gap['kind'][] = ['NO_PRODUCT', 'NOT_COMPARABLE'];

export const getGapKey = (gap: Pick<Gap, 'kind' | 'ingredientId'>) =>
  `${gap.kind}:${gap.ingredientId}`;

/** Every nudge key an ingredient can have. */
export const getGapKeys = (ingredientId: string) =>
  GAP_KINDS.map((kind) => getGapKey({ kind, ingredientId }));

/** The gaps the person hasn't closed. */
export const withoutDismissed = (
  gaps: Gap[],
  dismissed: Record<string, number>,
) => gaps.filter((gap) => !(getGapKey(gap) in dismissed));
