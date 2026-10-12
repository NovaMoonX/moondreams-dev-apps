import type { Meal, Product, Recipe } from '@apps/pinch/types';

export interface Usage {
  plannedMeals: number;
  savedMeals: number;
  recipes: number;
  products: number;
}

export const NO_USAGE: Usage = {
  plannedMeals: 0,
  savedMeals: 0,
  recipes: 0,
  products: 0,
};

export const isInUse = (usage: Usage) =>
  usage.plannedMeals + usage.savedMeals + usage.recipes + usage.products > 0;

const countSavedMeals = (meals: Meal[], kind: 'RECIPE' | 'INGREDIENT', id: string) =>
  meals.filter((meal) =>
    meal.items.some((item) => item.kind === kind && item.refId === id),
  ).length;

/** What still points at a recipe: saved meals (loaded) and the planned meals the caller counted. */
export const getRecipeUsage = (
  meals: Meal[],
  id: string,
  plannedMeals: number,
): Usage => ({
  ...NO_USAGE,
  plannedMeals,
  savedMeals: countSavedMeals(meals, 'RECIPE', id),
});

/** What still points at an ingredient: recipe lines, saved meals, products (loaded) and the planned meals the caller counted. */
export const getIngredientUsage = (
  recipes: Recipe[],
  meals: Meal[],
  products: Product[],
  id: string,
  plannedMeals: number,
): Usage => ({
  plannedMeals,
  savedMeals: countSavedMeals(meals, 'INGREDIENT', id),
  recipes: recipes.filter((recipe) =>
    recipe.ingredients.some((line) => line.ingredientId === id),
  ).length,
  products: products.filter((product) => product.ingredientId === id).length,
});

/** Products are the only thing that points at a store. */
export const getStoreUsage = (products: Product[], id: string): Usage => ({
  ...NO_USAGE,
  products: products.filter((product) => product.storeId === id).length,
});

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "3 planned meals and a saved meal", for the line that says why something will be hidden, not erased. */
export function describeUsage(usage: Usage): string {
  const parts = [
    usage.plannedMeals > 0 && plural(usage.plannedMeals, 'planned meal', 'planned meals'),
    usage.savedMeals > 0 && plural(usage.savedMeals, 'saved meal', 'saved meals'),
    usage.recipes > 0 && plural(usage.recipes, 'recipe', 'recipes'),
    usage.products > 0 && plural(usage.products, 'product', 'products'),
  ].filter((part): part is string => part !== false);

  return parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
