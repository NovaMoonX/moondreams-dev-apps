import type { Package, Recipe, ShoppingItem } from '@apps/pinch/types';
import { isPutAway } from '@apps/pinch/utils/shopping';

/** The most rows an ingredient picker offers while its field is empty. */
export const MAX_PICK_SUGGESTIONS = 3;

type RecipeLines = Pick<Recipe, 'id' | 'ingredients' | 'updatedAt'>;

/** The first ingredient ids of the lists, in order, each once, leaving out `exclude`: what a picker offers before anything is typed. */
export function takeSuggestionIds(
  lists: readonly (readonly string[])[],
  exclude: ReadonlySet<string> = new Set(),
  cap = MAX_PICK_SUGGESTIONS,
) {
  const result = [...new Set(lists.flat())]
    .filter((id) => id !== '' && !exclude.has(id))
    .slice(0, cap);
  return result;
}

const newestFirst = <T>(items: readonly T[], getAt: (item: T) => number) =>
  [...items].sort((a, b) => getAt(b) - getAt(a));

/** Every ingredient the recipes use, the one in the most recipes first and the one in the most recently changed recipe first among equals. A recipe that lists an ingredient under two headings counts once. */
export function rankOftenUsedIngredients(recipes: readonly RecipeLines[]) {
  const usage = recipes.reduce((byId, recipe) => {
    new Set(recipe.ingredients.map((line) => line.ingredientId)).forEach(
      (id) => {
        const known = byId.get(id);
        byId.set(id, {
          count: (known?.count ?? 0) + 1,
          latest: Math.max(known?.latest ?? -Infinity, recipe.updatedAt),
        });
      },
    );
    return byId;
  }, new Map<string, { count: number; latest: number }>());
  const result = [...usage.entries()]
    .sort(
      ([aId, a], [bId, b]) =>
        b.count - a.count || b.latest - a.latest || aId.localeCompare(bId),
    )
    .map(([id]) => id);
  return result;
}

/** What to offer when a package is added: the lines ticked "Got it" that aren't in the pantry yet, newest tick first, then the newest packages in stock. */
export function getPantryPickIds(
  shoppingItems: readonly ShoppingItem[],
  packages: readonly Package[],
) {
  const gotIt = newestFirst(
    shoppingItems.filter((item) => item.isChecked && !isPutAway(item)),
    (item) => item.updatedAt,
  ).map((item) => item.ingredientId);
  const stocked = newestFirst(
    packages.filter((pkg) => pkg.status === 'IN_STOCK'),
    (pkg) => pkg.createdAt,
  ).map((pkg) => pkg.ingredientId);
  const result = takeSuggestionIds([gotIt, stocked]);
  return result;
}

/** What to offer when one thing is added to the list: what was on it or in a recipe cooked lately, newest first, leaving out whatever is still to buy. A recipe's lines keep their order. */
export function getShoppingPickIds(
  shoppingItems: readonly ShoppingItem[],
  recipes: readonly RecipeLines[],
  cookSummaries: ReadonlyMap<string, { lastCookedAt: number }>,
) {
  const toBuy = new Set(
    shoppingItems
      .filter((item) => !item.isChecked)
      .map((item) => item.ingredientId),
  );
  const seen = [
    ...shoppingItems.map((item) => ({
      id: item.ingredientId,
      at: item.updatedAt,
    })),
    ...recipes.flatMap((recipe) => {
      const at = cookSummaries.get(recipe.id)?.lastCookedAt;
      return at === undefined
        ? []
        : recipe.ingredients.map((line) => ({ id: line.ingredientId, at }));
    }),
  ];
  const result = takeSuggestionIds(
    [newestFirst(seen, (entry) => entry.at).map((entry) => entry.id)],
    toBuy,
  );
  return result;
}

/** What to offer when a price is added: the ingredients still waiting for one, the ones in the most recipes first, then the rest in the order given. */
export function getPricePickIds(
  waiting: readonly string[],
  oftenUsed: readonly string[],
) {
  const isWaiting = new Set(waiting);
  const result = takeSuggestionIds([
    oftenUsed.filter((id) => isWaiting.has(id)),
    waiting,
  ]);
  return result;
}
