import { generateUuid } from '@/utils/idUtils';
import { CATALOG_INGREDIENTS_BY_ID } from '@apps/pinch/catalog';
import {
  MAX_MEAL_ITEMS,
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_IMPORTED_TIPS,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_NOTE_LENGTH,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_SHARED_MEAL_LINES,
  MAX_SHARED_MEAL_RECIPES,
  MAX_STEP_LENGTH,
  UNITS,
} from '@apps/pinch/constants';
import type {
  IngredientRecord,
  Meal,
  MealItem,
  PinchShareResult,
  Recipe,
  RecipeIngredient,
  RecipeNote,
  ShareKind,
  SharedRecipe,
  SharedMeal,
} from '@apps/pinch/types';
import { cleanGroupName } from '@apps/pinch/utils/ingredientGroups';
import { getStepAnchor } from '@apps/pinch/utils/notes';
import {
  matchIngredient,
  normalizeName,
  withoutFiller,
} from '@apps/pinch/utils/ingredientMatch';
import { toCare } from '@apps/pinch/utils/recipeCare';
import { cleanLinks } from '@apps/pinch/utils/recipeLinks';
import { resolveIngredients } from '@apps/pinch/utils/resolveIngredient';

/** What one import may write in a single batch: its recipes, the meal and every ingredient it has to make. */
export const MAX_IMPORT_WRITES =
  MAX_SHARED_MEAL_RECIPES + MAX_SHARED_MEAL_LINES + 1 + MAX_IMPORTED_TIPS;

export const NO_INGREDIENTS_PROBLEM =
  "This recipe has no ingredients, so there's nothing to add.";
export const EMPTY_MEAL_PROBLEM =
  "This saved meal is empty, so there's nothing to add.";
export const TOO_BIG_PROBLEM = 'This is too big to add in one go.';
export const UNDO_BLOCKED_PROBLEM =
  "You've changed or used it since, so Undo left it alone. You can remove it yourself from Recipes or Saved meals.";

export interface PlannedRecipe {
  recipe: Recipe;
  /** The tips that came with it, as the new recipe's own. */
  tips: RecipeNote[];
  /** The recipe's place in the share, which names its cover there. */
  shareIndex: number;
  hasCover: boolean;
}

/** Everything one add writes, minted and checked against the rules' shapes before a single write is made. */
export interface ShareImportPlan {
  recipes: PlannedRecipe[];
  /** Custom ingredients the share named that the person's kitchen has no match for. */
  ingredients: IngredientRecord[];
  meal: Meal | null;
}

export interface ShareImportPlanResult {
  plan: ShareImportPlan | null;
  /** A plain sentence for the person when there is no plan. */
  problem: string | null;
}

export interface WrittenTip {
  id: string;
  recipeId: string;
}

interface WrittenDoc {
  id: string;
  /** The document's `updatedAt` as the add left it, to tell later whether it has changed. */
  updatedAt: number;
}

/** What an add wrote, kept by the page so its Undo takes back exactly that. */
export interface ShareImportWritten {
  recipes: WrittenDoc[];
  meal: WrittenDoc | null;
  ingredients: WrittenDoc[];
  /** The tips the add wrote, taken back with their recipe. */
  tips: WrittenTip[];
  /** The recipes that got a copy of the shared cover. */
  coverRecipeIds: string[];
  /** Covers the share had that did not come along. */
  missingCovers: number;
}

/** What is stored now that could stop an Undo or keep an ingredient: read once, from the server, right before the Undo. */
export interface UndoSurvey {
  recipes: Map<string, { updatedAt: number; ingredientIds: string[] }>;
  meals: Map<string, { updatedAt: number; items: MealItem[] }>;
  ingredients: Map<string, number>;
  /** Ids that planned days, prices and boxes in the fridge or freezer point at. */
  usedIds: Set<string>;
}

export type UndoPlan =
  | { problem: string }
  | {
      problem: null;
      recipeIds: string[];
      mealId: string | null;
      ingredientIds: string[];
      tipIds: string[];
      /** Ingredients the add made that stay because something else uses them now. */
      keptIngredients: number;
    };

/** What a link holds: a recipe or a saved meal. */
export type ShareTarget =
  { kind: 'RECIPE'; recipe: SharedRecipe } | { kind: 'MEAL'; meal: SharedMeal };

/** What an answer holds, or null when it lacks what its kind says. */
export function getShareTarget(
  share: Extract<PinchShareResult, { status: 'ok' }>,
): ShareTarget | null {
  if (share.kind === 'RECIPE' && share.recipe) {
    return { kind: 'RECIPE', recipe: share.recipe };
  }
  const { meal } = share;
  const isWhole =
    share.kind === 'MEAL' &&
    meal !== null &&
    meal.items.every(
      (item) =>
        item.kind !== 'RECIPE' || meal.recipes[item.recipeIndex] !== undefined,
    );
  return isWhole ? { kind: 'MEAL', meal } : null;
}

interface NameRef {
  name: string;
  catalogId: string | null;
}

const asPositiveNumber = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_SERVING_AMOUNT
    ? value
    : null;

const asMinutes = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_MINUTES
    ? Math.round(value)
    : null;

const asText = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const result = text === '' ? null : text.slice(0, max).trim();
  return result;
};

const asName = (value: unknown) =>
  asText(
    typeof value === 'string' ? value.replace(/\s+/g, ' ') : '',
    MAX_NAME_LENGTH,
  ) ?? 'Ingredient';

const getRefKey = (name: string) =>
  withoutFiller(name) || normalizeName(name) || name.trim().toLowerCase();

const isCatalogRef = (ref: NameRef) =>
  ref.catalogId !== null && CATALOG_INGREDIENTS_BY_ID.has(ref.catalogId);

const buildCustomRecord = (
  id: string,
  name: string,
  now: number,
): IngredientRecord => ({
  id,
  catalogId: null,
  name: asName(name),
  familyId: null,
  iconKey: null,
  nutritionPer100g: null,
  servingAmount: null,
  servingUnit: null,
  gramsPerMl: null,
  gramsEach: null,
  defaultProductId: null,
  isArchived: false,
  createdAt: now,
  updatedAt: now,
});

/**
 * The ingredient each name in a share means in this kitchen: a `cat-` id the catalog has is kept, else the person's own match
 * (or the catalog's) by name, else one new custom ingredient per distinct name, however many lines and recipes use it.
 */
export function mapIngredients(
  refs: NameRef[],
  records: IngredientRecord[],
  now: number,
  makeId: () => string = generateUuid,
) {
  const candidates = resolveIngredients(records).filter(
    (ingredient) => !ingredient.isArchived,
  );
  const resolve = (ref: NameRef) => {
    const match = matchIngredient(ref.name, candidates);
    if (match) return { id: match.id, created: null };

    const id = makeId();
    return { id, created: buildCustomRecord(id, ref.name, now) };
  };
  const byKey = refs.reduce((acc, ref) => {
    const key = getRefKey(ref.name);
    return isCatalogRef(ref) || acc.has(key) ? acc : acc.set(key, resolve(ref));
  }, new Map<string, { id: string; created: IngredientRecord | null }>());

  const created = [...byKey.values()].flatMap((entry) =>
    entry.created ? [entry.created] : [],
  );
  const getId = (ref: NameRef) =>
    isCatalogRef(ref)
      ? (ref.catalogId as string)
      : (byKey.get(getRefKey(ref.name))?.id ?? '');

  return { created, getId };
}

const getUsableLines = (recipe: SharedRecipe) =>
  recipe.ingredients
    .filter((line) => typeof line.name === 'string')
    .slice(0, MAX_RECIPE_INGREDIENTS);

const toRecipe = (
  shared: SharedRecipe,
  id: string,
  getId: (ref: NameRef) => string,
  now: number,
  makeId: () => string,
): Recipe => ({
  id,
  title: asText(shared.title, MAX_RECIPE_TITLE_LENGTH) ?? 'Recipe',
  description: asText(shared.description, MAX_RECIPE_DESCRIPTION_LENGTH),
  servings: asPositiveNumber(shared.servings) ?? 1,
  prepMinutes: asMinutes(shared.prepMinutes),
  cookMinutes: asMinutes(shared.cookMinutes),
  coverPath: null,
  coverUrl: null,
  ingredients: getUsableLines(shared).map((line): RecipeIngredient => {
    const amount = asPositiveNumber(line.amount);
    return {
      id: makeId(),
      ingredientId: getId(line),
      amount,
      unit: amount === null || !UNITS.includes(line.unit) ? 'EACH' : line.unit,
      note: asText(line.note, MAX_NOTE_LENGTH),
      group: cleanGroupName(line.group),
    };
  }),
  steps: shared.steps
    .map((step) => asText(step, MAX_STEP_LENGTH))
    .filter((step) => step !== null)
    .slice(0, MAX_RECIPE_STEPS),
  nutritionOverride: null,
  source: 'MANUAL',
  sourceId: null,
  care: toCare(shared.care),
  collectionIds: [],
  categories: [],
  links: cleanLinks(
    shared.links.map((link) => ({
      id: makeId(),
      kind: link.kind,
      label: link.label,
      url: link.url,
    })),
  ),
  isArchived: false,
  isFavorite: false,
  createdAt: now,
  updatedAt: now,
});

/** The shared tips as the new recipe's own, each under the same step of the imported recipe (or the whole recipe when that step isn't there). */
const toTips = (
  shared: SharedRecipe,
  recipe: Recipe,
  now: number,
  makeId: () => string,
): RecipeNote[] =>
  (Array.isArray(shared.tips) ? shared.tips : []).flatMap((tip) => {
    const text = asText(tip?.text, MAX_RECIPE_NOTE_LENGTH);
    if (text === null) return [];
    const step =
      typeof tip.step === 'number' && Number.isInteger(tip.step)
        ? tip.step
        : null;
    return [
      {
        id: makeId(),
        recipeId: recipe.id,
        kind: 'TIP' as const,
        text,
        changes: [],
        cookId: null,
        ...getStepAnchor(recipe.steps, step),
        reason: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
  });

const withTips = (
  entry: Omit<PlannedRecipe, 'tips'>,
  shared: SharedRecipe,
  now: number,
  makeId: () => string,
): PlannedRecipe => ({
  ...entry,
  tips: toTips(shared, entry.recipe, now, makeId),
});

/** At most `MAX_IMPORTED_TIPS` across the whole add, so it stays one batch: the first recipes keep theirs whole. */
const limitTips = (recipes: PlannedRecipe[]): PlannedRecipe[] =>
  recipes.reduce<{ left: number; result: PlannedRecipe[] }>(
    ({ left, result }, entry) => ({
      left: Math.max(0, left - entry.tips.length),
      result: [...result, { ...entry, tips: entry.tips.slice(0, left) }],
    }),
    { left: MAX_IMPORTED_TIPS, result: [] },
  ).result;

/** Tips are cut to their own cap beforehand, so only the rest of the add can make it too big. */
const isTooBig = (plan: ShareImportPlan) =>
  plan.recipes.length + plan.ingredients.length + (plan.meal ? 1 : 0) >
  MAX_IMPORT_WRITES - MAX_IMPORTED_TIPS;

const withProblem = (problem: string): ShareImportPlanResult => ({
  plan: null,
  problem,
});

/** A shared recipe as the new recipe, and the ingredients it needs, written as the share names them. Nothing of the sharer's own (ids, prices, notes, cover address) is carried: the recipe starts as a plain manual one with every key. */
export function planRecipeImport(
  shared: SharedRecipe,
  records: IngredientRecord[],
  now: number,
  makeId: () => string = generateUuid,
): ShareImportPlanResult {
  const lines = getUsableLines(shared);
  if (lines.length === 0) return withProblem(NO_INGREDIENTS_PROBLEM);

  const { created, getId } = mapIngredients(lines, records, now, makeId);
  const plan: ShareImportPlan = {
    recipes: limitTips([
      withTips(
        {
          recipe: toRecipe(shared, makeId(), getId, now, makeId),
          shareIndex: 0,
          hasCover: shared.hasCover,
        },
        shared,
        now,
        makeId,
      ),
    ]),
    ingredients: created,
    meal: null,
  };

  return isTooBig(plan)
    ? withProblem(TOO_BIG_PROBLEM)
    : { plan, problem: null };
}

/** A shared saved meal as a new meal: each recipe it uses is written once however many items point at it, its ingredient items are matched like a recipe's lines, and every item points at what was written. */
export function planMealImport(
  shared: SharedMeal,
  records: IngredientRecord[],
  now: number,
  makeId: () => string = generateUuid,
): ShareImportPlanResult {
  const items = shared.items
    .filter((item) => {
      if (asPositiveNumber(item.servings) === null) return false;
      return item.kind === 'RECIPE'
        ? shared.recipes[item.recipeIndex] !== undefined
        : typeof item.name === 'string' && item.name.trim() !== '';
    })
    .slice(0, MAX_MEAL_ITEMS);
  if (items.length === 0) return withProblem(EMPTY_MEAL_PROBLEM);

  const recipeIndexes = [
    ...new Set(
      items.flatMap((item) =>
        item.kind === 'RECIPE' ? [item.recipeIndex] : [],
      ),
    ),
  ];
  if (
    recipeIndexes.some(
      (index) => getUsableLines(shared.recipes[index]).length === 0,
    )
  ) {
    return withProblem(NO_INGREDIENTS_PROBLEM);
  }

  const { created, getId } = mapIngredients(
    [
      ...recipeIndexes.flatMap((index) =>
        getUsableLines(shared.recipes[index]),
      ),
      ...items.flatMap((item) => (item.kind === 'INGREDIENT' ? [item] : [])),
    ],
    records,
    now,
    makeId,
  );
  const idByIndex = new Map(recipeIndexes.map((index) => [index, makeId()]));
  const meal: Meal = {
    id: makeId(),
    name: asText(shared.name, MAX_NAME_LENGTH) ?? 'Saved meal',
    items: items.map((item): MealItem => ({
      id: makeId(),
      kind: item.kind,
      refId:
        item.kind === 'RECIPE'
          ? (idByIndex.get(item.recipeIndex) as string)
          : getId(item),
      servings: item.servings,
    })),
    categories: [],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
  const plan: ShareImportPlan = {
    recipes: limitTips(
      recipeIndexes.map((index) =>
        withTips(
          {
            recipe: toRecipe(
              shared.recipes[index],
              idByIndex.get(index) as string,
              getId,
              now,
              makeId,
            ),
            shareIndex: index,
            hasCover: shared.recipes[index].hasCover,
          },
          shared.recipes[index],
          now,
          makeId,
        ),
      ),
    ),
    ingredients: created,
    meal,
  };

  return isTooBig(plan)
    ? withProblem(TOO_BIG_PROBLEM)
    : { plan, problem: null };
}

/** The recipes whose shared cover is to be copied onto them once they are written. */
export const getCoverTargets = (plan: ShareImportPlan) =>
  plan.recipes
    .filter((entry) => entry.hasCover)
    .map((entry) => ({ index: entry.shareIndex, recipeId: entry.recipe.id }));

/** What the add wrote; a recipe that got its cover carries the `updatedAt` that write left. */
export function getWritten(
  plan: ShareImportPlan,
  copiedCovers: { recipeId: string; updatedAt: number }[],
): ShareImportWritten {
  const written: ShareImportWritten = {
    recipes: plan.recipes.map(({ recipe }) => ({
      id: recipe.id,
      updatedAt:
        copiedCovers.find((cover) => cover.recipeId === recipe.id)?.updatedAt ??
        recipe.updatedAt,
    })),
    meal: plan.meal && { id: plan.meal.id, updatedAt: plan.meal.updatedAt },
    ingredients: plan.ingredients.map(({ id, updatedAt }) => ({
      id,
      updatedAt,
    })),
    tips: plan.recipes.flatMap(({ recipe, tips }) =>
      tips.map((tip) => ({ id: tip.id, recipeId: recipe.id })),
    ),
    coverRecipeIds: copiedCovers.map((cover) => cover.recipeId),
    missingCovers: getCoverTargets(plan).length - copiedCovers.length,
  };

  return written;
}

/** What the slot says once an add has gone through: a meal names what came with it. */
export function getAddedMessage(kind: ShareKind, recipeCount: number) {
  if (kind === 'RECIPE') return 'Added to your recipes';
  if (recipeCount === 0) return 'Added the saved meal';
  return `Added the saved meal and its ${recipeCount} ${recipeCount === 1 ? 'recipe' : 'recipes'}`;
}

/** What the slot says once an Undo has gone through; an ingredient that stayed is named only when there is one. */
export function getUndoneMessage(keptIngredients: number) {
  if (keptIngredients === 0) return 'Taken back.';
  return `Taken back. ${keptIngredients === 1 ? 'One ingredient' : `${keptIngredients} ingredients`} you've used since stayed.`;
}

/**
 * What an Undo may take back. All or none: if a recipe or the meal has been changed or used since (edited, planned, boxed, in another saved meal) nothing is deleted.
 * An ingredient the add made stays when it was changed or something else points at it now.
 */
export function planUndo(
  written: ShareImportWritten,
  survey: UndoSurvey,
): UndoPlan {
  const writtenRecipeIds = new Set(written.recipes.map((entry) => entry.id));
  const otherRecipes = [...survey.recipes].filter(
    ([id]) => !writtenRecipeIds.has(id),
  );
  const otherMeals = [...survey.meals].filter(
    ([id]) => id !== written.meal?.id,
  );
  const isChanged = (
    doc: WrittenDoc,
    stored: { updatedAt: number } | undefined,
  ) => stored !== undefined && stored.updatedAt !== doc.updatedAt;
  const isRecipeUsed = (id: string) =>
    survey.usedIds.has(id) ||
    otherMeals.some(([, meal]) =>
      meal.items.some((item) => item.kind === 'RECIPE' && item.refId === id),
    );
  const isIngredientUsed = (id: string) =>
    survey.usedIds.has(id) ||
    otherRecipes.some(([, recipe]) => recipe.ingredientIds.includes(id)) ||
    otherMeals.some(([, meal]) =>
      meal.items.some(
        (item) => item.kind === 'INGREDIENT' && item.refId === id,
      ),
    );

  const isBlocked =
    written.recipes.some(
      (entry) =>
        isChanged(entry, survey.recipes.get(entry.id)) ||
        (survey.recipes.has(entry.id) && isRecipeUsed(entry.id)),
    ) ||
    (written.meal !== null &&
      isChanged(written.meal, survey.meals.get(written.meal.id)));
  if (isBlocked) return { problem: UNDO_BLOCKED_PROBLEM };

  const ingredientIds = written.ingredients
    .filter(
      (entry) =>
        survey.ingredients.get(entry.id) === entry.updatedAt &&
        !isIngredientUsed(entry.id),
    )
    .map((entry) => entry.id);
  const result: UndoPlan = {
    problem: null,
    recipeIds: written.recipes
      .filter((entry) => survey.recipes.has(entry.id))
      .map((entry) => entry.id),
    mealId:
      written.meal !== null && survey.meals.has(written.meal.id)
        ? written.meal.id
        : null,
    ingredientIds,
    tipIds: written.tips
      .filter(
        (tip) =>
          survey.recipes.has(tip.recipeId),
      )
      .map((tip) => tip.id),
    keptIngredients: written.ingredients.filter(
      (entry) =>
        survey.ingredients.has(entry.id) && !ingredientIds.includes(entry.id),
    ).length,
  };

  return result;
}
