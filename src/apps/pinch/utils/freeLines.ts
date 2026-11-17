import type { RecipeIngredient, ResolvedIngredient } from '@apps/pinch/types';

type LineRef = Pick<RecipeIngredient, 'id' | 'ingredientId'>;

/** A line that is not a kitchen ingredient ("reserved pasta water"): it keeps its words and is left out of cost, nutrition, shopping, stock and "Used in". */
export const isFreeLine = (
  line: Pick<RecipeIngredient, 'ingredientId'>,
): line is { ingredientId: null } => line.ingredientId === null;

/** One key per ingredient, and one per free line, for code that groups lines by what they are. */
export const getLineKey = (line: LineRef) =>
  line.ingredientId ?? `free:${line.id}`;

/** What a line is called: the ingredient's name, or a free line's own words. */
export const getLineName = (
  line: Pick<RecipeIngredient, 'ingredientId' | 'freeText'>,
  ingredientsById: Map<string, ResolvedIngredient>,
) =>
  line.ingredientId === null
    ? (line.freeText ?? '')
    : (ingredientsById.get(line.ingredientId)?.name ?? 'Removed ingredient');

/** The ingredient ids a recipe's lines name; free lines name none. */
export const getLineIngredientIds = (
  lines: readonly Pick<RecipeIngredient, 'ingredientId'>[],
) =>
  lines.flatMap((line) =>
    line.ingredientId === null ? [] : [line.ingredientId],
  );

/** Ingredients a recipe's lines left behind by turning into free lines, and that no other line of it still names. */
export const getFreedIngredientIds = (
  before: readonly Pick<RecipeIngredient, 'id' | 'ingredientId'>[],
  after: readonly Pick<RecipeIngredient, 'id' | 'ingredientId'>[],
) => {
  const stillNamed = new Set(getLineIngredientIds(after));
  const nowFree = new Set(after.filter(isFreeLine).map((line) => line.id));
  return [
    ...new Set(
      before.flatMap((line) =>
        line.ingredientId !== null &&
        nowFree.has(line.id) &&
        !stillNamed.has(line.ingredientId)
          ? [line.ingredientId]
          : [],
      ),
    ),
  ];
};
