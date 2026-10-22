import { isValidHttpsUrl } from '@/utils/urlUtils';
import {
  MAX_SHARED_MEAL_LINES,
  MAX_SHARED_MEAL_RECIPES,
  MAX_SHARED_NOTES,
  MAX_SHARED_NOTE_LENGTH,
  MAX_SHARED_TIPS,
  MAX_SHARED_TIP_LENGTH,
  SHARE_LINK_PATH,
} from '@apps/pinch/constants';
import type {
  Meal,
  MealItem,
  PinchShare,
  Recipe,
  RecipeIngredient,
  RecipeNote,
  RecipeLink,
  ResolvedIngredient,
  ShareCoverRef,
  ShareKind,
  SharedIngredient,
  SharedMeal,
  SharedMealItem,
  SharedRecipe,
  SharedRecipeLink,
  SharedRecipeEntry,
} from '@apps/pinch/types';
import { resolveNoteStep } from '@apps/pinch/utils/notes';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';

export type NotesByRecipe = Map<string, RecipeNote[]>;

/** Which of the owner's written entries a share carries, each chosen on its own. */
export interface ShareIncludes {
  tips: boolean;
  notes: boolean;
}

export const NO_SHARE_INCLUDES: ShareIncludes = { tips: false, notes: false };

/** A link made before the choice existed has neither flag: it carries neither. */
export const getShareIncludes = (
  share: Pick<PinchShare, 'includesTips' | 'includesNotes'>,
): ShareIncludes => ({
  tips: share.includesTips === true,
  notes: share.includesNotes === true,
});

export type ShareSource =
  { kind: 'RECIPE'; recipe: Recipe } | { kind: 'MEAL'; meal: Meal };

export interface SharePayload {
  recipe: SharedRecipe | null;
  meal: SharedMeal | null;
  covers: ShareCoverRef[];
  sourceUpdatedAt: number;
  includesTips: boolean;
  includesNotes: boolean;
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

const getEntries = (notes: RecipeNote[], kind: 'TIP' | 'NOTE'): RecipeNote[] =>
  notes.filter((note) => note.kind === kind && (note.text ?? '').trim() !== '');

/** A recipe's tips or notes as a share carries them: the words and the step they sit under (its number, or null for the whole recipe), in step order, oldest first. Only the words and the step number leave: never a date, an id or a cook. */
const toSharedEntries = (
  recipe: Recipe,
  notes: RecipeNote[],
  kind: 'TIP' | 'NOTE',
  maxCount: number,
  maxLength: number,
): SharedRecipeEntry[] =>
  getEntries(notes, kind)
    .map((note) => ({
      text: (note.text ?? '').trim().slice(0, maxLength),
      step: resolveNoteStep(note, recipe.steps),
      createdAt: note.createdAt,
    }))
    .sort(
      (a, b) =>
        (a.step ?? -1) - (b.step ?? -1) || a.createdAt - b.createdAt,
    )
    .slice(0, maxCount)
    .map(({ text, step }) => ({ text, step }));

const getIncludedEntries = (
  notes: RecipeNote[],
  includes: ShareIncludes,
): RecipeNote[] => [
  ...(includes.tips ? getEntries(notes, 'TIP') : []),
  ...(includes.notes ? getEntries(notes, 'NOTE') : []),
];

/** Copies fields by name, never the recipe itself, so a field added to it later stays out of a share. */
export function buildSharedRecipe(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
  notes: RecipeNote[] = [],
  includes: ShareIncludes = NO_SHARE_INCLUDES,
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
    tips: includes.tips
      ? toSharedEntries(recipe, notes, 'TIP', MAX_SHARED_TIPS, MAX_SHARED_TIP_LENGTH)
      : [],
    notes: includes.notes
      ? toSharedEntries(recipe, notes, 'NOTE', MAX_SHARED_NOTES, MAX_SHARED_NOTE_LENGTH)
      : [],
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
  notesByRecipe: NotesByRecipe = new Map(),
  includes: ShareIncludes = NO_SHARE_INCLUDES,
): SharedMeal | { error: string } {
  const recipes = getMealShareRecipes(meal, recipesById);
  const indexById = new Map(recipes.map((recipe, index) => [recipe.id, index]));
  const sharedRecipes = recipes.map((recipe) =>
    buildSharedRecipe(
      recipe,
      ingredientsById,
      notesByRecipe.get(recipe.id),
      includes,
    ),
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

/** The latest change to what a share would carry: the source, its recipes and the entries included. Adding the entry count moves it when an entry is deleted, which no timestamp shows. */
export function getShareSourceStamp(
  source: ShareSource,
  recipesById: Map<string, Recipe>,
  notesByRecipe: NotesByRecipe = new Map(),
  includes: ShareIncludes = NO_SHARE_INCLUDES,
): number {
  const recipes = getShareRecipes(source, recipesById);
  const entries = recipes.flatMap((recipe) =>
    getIncludedEntries(notesByRecipe.get(recipe.id) ?? [], includes),
  );
  const result =
    Math.max(
      source.kind === 'MEAL' ? source.meal.updatedAt : 0,
      ...recipes.map((recipe) => recipe.updatedAt),
      ...entries.map((entry) => entry.updatedAt),
    ) + entries.length;

  return result;
}

export const isShareStale = (
  share: Pick<PinchShare, 'sourceUpdatedAt'>,
  stamp: number,
) => stamp !== share.sourceUpdatedAt;

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
  notesByRecipe: NotesByRecipe = new Map(),
  includes: ShareIncludes = NO_SHARE_INCLUDES,
): SharePayload | { error: string } {
  const sourceUpdatedAt = getShareSourceStamp(
    source,
    recipesById,
    notesByRecipe,
    includes,
  );
  const covers = getCoverRefs(getShareRecipes(source, recipesById));

  if (source.kind === 'RECIPE') {
    return {
      recipe: buildSharedRecipe(
        source.recipe,
        ingredientsById,
        notesByRecipe.get(source.recipe.id),
        includes,
      ),
      meal: null,
      covers,
      sourceUpdatedAt,
      includesTips: includes.tips,
      includesNotes: includes.notes,
    };
  }

  const meal = buildSharedMeal(
    source.meal,
    recipesById,
    ingredientsById,
    notesByRecipe,
    includes,
  );
  if ('error' in meal) return meal;

  return {
    recipe: null,
    meal,
    covers,
    sourceUpdatedAt,
    includesTips: includes.tips,
    includesNotes: includes.notes,
  };
}

export function getShareStatus(
  share: PinchShare,
  recipesById: Map<string, Recipe>,
  mealsById: Map<string, Meal>,
  notesByRecipe: NotesByRecipe = new Map(),
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
    isStale: isShareStale(
      share,
      getShareSourceStamp(
        source,
        recipesById,
        notesByRecipe,
        getShareIncludes(share),
      ),
    ),
  };

  return result;
}
