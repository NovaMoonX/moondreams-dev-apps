import { isValidHttpsUrl } from '@/utils/urlUtils';
import {
  MAX_SHARED_MEAL_LINES,
  MAX_SHARED_MEAL_RECIPES,
  SHARE_LINK_PATH,
} from '@apps/pinch/constants';
import type {
  Meal,
  MealItem,
  PinchShare,
  Recipe,
  RecipeIngredient,
  RecipeLink,
  ResolvedIngredient,
  ShareCoverRef,
  ShareKind,
  SharedIngredient,
  SharedMeal,
  SharedMealItem,
  SharedRecipe,
  SharedRecipeLink,
} from '@apps/pinch/types';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';

export type ShareSource =
  { kind: 'RECIPE'; recipe: Recipe } | { kind: 'MEAL'; meal: Meal };

export interface SharePayload {
  recipe: SharedRecipe | null;
  meal: SharedMeal | null;
  covers: ShareCoverRef[];
  sourceUpdatedAt: number;
}

export interface ShareStatus {
  /** The recipe or saved meal the link was made from no longer exists. */
  isGone: boolean;
  /** The source changed after the copy was taken. */
  isStale: boolean;
}

export const getShareKey = (kind: ShareKind, sourceId: string) =>
  `${kind}:${sourceId}`;

export const getShareUrl = (id: string, origin: string) =>
  `${origin}${SHARE_LINK_PATH}${id}`;

const toSharedLine = (
  line: RecipeIngredient,
  ingredientsById: Map<string, ResolvedIngredient>,
): SharedIngredient[] => {
  const ingredient = ingredientsById.get(line.ingredientId);
  if (!ingredient) return [];

  return [
    {
      name: ingredient.name,
      catalogId: ingredient.isCustom ? null : ingredient.id,
      amount: line.amount ?? null,
      unit: line.unit,
      note: line.note ?? null,
      group: line.group ?? null,
    },
  ];
};

const toSharedLinks = (links: RecipeLink[] | undefined): SharedRecipeLink[] => {
  const result = (links ?? [])
    .filter((link) => isValidHttpsUrl(link.url))
    .map((link) => ({
      kind: link.kind,
      label: link.label ?? null,
      url: link.url.trim(),
    }));

  return result;
};

/** Copies fields by name, never the recipe itself, so a field added to it later stays out of a share. */
export function buildSharedRecipe(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
): SharedRecipe {
  const result: SharedRecipe = {
    title: recipe.title,
    description: recipe.description ?? null,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    ingredients: recipe.ingredients.flatMap((line) =>
      toSharedLine(line, ingredientsById),
    ),
    steps: [...recipe.steps],
    care: getRecipeCare(recipe),
    links: toSharedLinks(recipe.links),
    hasCover: recipe.coverPath != null,
  };

  return result;
}

/** Each recipe once, in the order of first appearance: the order a shared meal's recipes and its covers' indexes follow. */
export function getMealShareRecipes(
  meal: Meal,
  recipesById: Map<string, Recipe>,
): Recipe[] {
  const found = meal.items
    .filter((item) => item.kind === 'RECIPE')
    .map((item) => recipesById.get(item.refId))
    .filter((recipe): recipe is Recipe => recipe !== undefined);
  const result = [
    ...new Map(found.map((recipe) => [recipe.id, recipe])).values(),
  ];

  return result;
}

const toSharedItem = (
  item: MealItem,
  indexById: Map<string, number>,
  ingredientsById: Map<string, ResolvedIngredient>,
): SharedMealItem[] => {
  if (item.kind === 'RECIPE') {
    const recipeIndex = indexById.get(item.refId);
    if (recipeIndex === undefined) return [];
    return [{ kind: 'RECIPE', servings: item.servings, recipeIndex }];
  }

  const ingredient = ingredientsById.get(item.refId);
  if (!ingredient) return [];
  return [
    {
      kind: 'INGREDIENT',
      servings: item.servings,
      name: ingredient.name,
      catalogId: ingredient.isCustom ? null : ingredient.id,
    },
  ];
};

export function buildSharedMeal(
  meal: Meal,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): SharedMeal | { error: string } {
  const recipes = getMealShareRecipes(meal, recipesById);
  const indexById = new Map(recipes.map((recipe, index) => [recipe.id, index]));
  const sharedRecipes = recipes.map((recipe) =>
    buildSharedRecipe(recipe, ingredientsById),
  );
  const items = meal.items.flatMap((item) =>
    toSharedItem(item, indexById, ingredientsById),
  );
  const lineCount =
    sharedRecipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) +
    items.filter((item) => item.kind === 'INGREDIENT').length;

  if (items.length === 0) {
    return { error: 'Nothing in this meal is left to share.' };
  }
  if (recipes.length > MAX_SHARED_MEAL_RECIPES) {
    return {
      error: `A shared meal holds up to ${MAX_SHARED_MEAL_RECIPES} recipes, and this one has more.`,
    };
  }
  if (lineCount > MAX_SHARED_MEAL_LINES) {
    return {
      error:
        'This meal has too many ingredients for one link. Share its recipes one at a time.',
    };
  }

  const result: SharedMeal = {
    name: meal.name,
    recipes: sharedRecipes,
    items,
  };

  return result;
}

export const getShareRecipes = (
  source: ShareSource,
  recipesById: Map<string, Recipe>,
): Recipe[] =>
  source.kind === 'RECIPE'
    ? [source.recipe]
    : getMealShareRecipes(source.meal, recipesById);

export function getCoverRefs(recipes: Recipe[]): ShareCoverRef[] {
  const result = recipes.flatMap((recipe, index) =>
    recipe.coverPath != null ? [{ index, recipeId: recipe.id }] : [],
  );

  return result;
}

/** A meal's stamp includes its recipes', so changing one of them counts as changing the meal. */
export function getShareSourceStamp(
  source: ShareSource,
  recipesById: Map<string, Recipe>,
): number {
  if (source.kind === 'RECIPE') return source.recipe.updatedAt;

  const result = Math.max(
    source.meal.updatedAt,
    ...getShareRecipes(source, recipesById).map((recipe) => recipe.updatedAt),
  );

  return result;
}

export const isShareStale = (
  share: Pick<PinchShare, 'sourceUpdatedAt'>,
  stamp: number,
) => stamp > share.sourceUpdatedAt;

export function getShareSource(
  kind: ShareKind,
  sourceId: string,
  recipesById: Map<string, Recipe>,
  mealsById: Map<string, Meal>,
): ShareSource | null {
  if (kind === 'RECIPE') {
    const recipe = recipesById.get(sourceId);
    return recipe ? { kind, recipe } : null;
  }

  const meal = mealsById.get(sourceId);
  return meal ? { kind, meal } : null;
}

export function buildSharePayload(
  source: ShareSource,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): SharePayload | { error: string } {
  const sourceUpdatedAt = getShareSourceStamp(source, recipesById);
  const covers = getCoverRefs(getShareRecipes(source, recipesById));

  if (source.kind === 'RECIPE') {
    return {
      recipe: buildSharedRecipe(source.recipe, ingredientsById),
      meal: null,
      covers,
      sourceUpdatedAt,
    };
  }

  const meal = buildSharedMeal(source.meal, recipesById, ingredientsById);
  if ('error' in meal) return meal;

  return { recipe: null, meal, covers, sourceUpdatedAt };
}

export function getShareStatus(
  share: PinchShare,
  recipesById: Map<string, Recipe>,
  mealsById: Map<string, Meal>,
): ShareStatus {
  const source = getShareSource(
    share.kind,
    share.sourceId,
    recipesById,
    mealsById,
  );
  if (source === null) return { isGone: true, isStale: false };

  const result = {
    isGone: false,
    isStale: isShareStale(share, getShareSourceStamp(source, recipesById)),
  };

  return result;
}
