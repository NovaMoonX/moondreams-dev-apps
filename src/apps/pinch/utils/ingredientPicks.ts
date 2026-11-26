import type {
  IngredientPick,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { withoutFiller } from '@apps/pinch/utils/ingredientMatch';

/** At most this many names are remembered; the oldest pick goes first. */
export const MAX_INGREDIENT_PICKS = 200;

/** The key a recipe's name is remembered under: prep and filler words dropped, plurals folded, so "2 cups flour, sifted" and "Flour" share one pick. Empty when nothing names a thing. */
export const getPickKey = (name: string) => withoutFiller(name).trim();

/** The ingredient the person picked last time for this name, while it still exists and isn't archived. */
export const findPickedIngredient = (
  name: string,
  picks: Record<string, IngredientPick>,
  ingredients: ResolvedIngredient[],
): ResolvedIngredient | null => {
  const key = getPickKey(name);
  const pick = key === '' ? undefined : picks[key];
  if (!pick) return null;
  return (
    ingredients.find(
      (ingredient) =>
        ingredient.id === pick.ingredientId && !ingredient.isArchived,
    ) ?? null
  );
};

/** The settings change that remembers a pick, forgetting the oldest once the list is full; null when the name has no key or the pick is already remembered. */
export const getRememberPatch = (
  name: string,
  ingredientId: string,
  picks: Record<string, IngredientPick>,
  now: number,
): Record<string, IngredientPick | null> | null => {
  const key = getPickKey(name);
  if (key === '' || picks[key]?.ingredientId === ingredientId) return null;
  const others = Object.entries(picks).filter(([other]) => other !== key);
  const overflow = others
    .sort(([, a], [, b]) => a.pickedAt - b.pickedAt)
    .slice(0, Math.max(0, others.length + 1 - MAX_INGREDIENT_PICKS));
  return {
    ...Object.fromEntries(overflow.map(([other]) => [other, null])),
    [key]: { name: name.trim(), ingredientId, pickedAt: now },
  };
};
