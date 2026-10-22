import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { CATALOG_FAMILIES } from '@apps/pinch/catalog';
import { DEFAULT_LEAD_DAYS, MEAL_TYPES } from '@apps/pinch/constants';
import type {
  Idea,
  PlannedMeal,
  Product,
  ResolvedFamily,
  ShareKind,
} from '@apps/pinch/types';
import {
  byEatBy,
  getMealStockMap,
  getStockMaps,
  groupContainersByCook,
} from '@apps/pinch/utils/containers';
import { getCookSummaries, groupCooksByRecipe } from '@apps/pinch/utils/cooks';
import { byUseBy, groupPackagesByIngredient } from '@apps/pinch/utils/packages';
import { getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import {
  getNoteSummaries,
  getTweakTracking,
  groupNotesByRecipe,
} from '@apps/pinch/utils/notes';
import { getRecipeNutrition } from '@apps/pinch/utils/nutritionMath';
import { getPeriodStats } from '@apps/pinch/utils/stats';
import { rankOftenUsedIngredients } from '@apps/pinch/utils/pickerSuggestions';
import { getRecipeCost } from '@apps/pinch/utils/recipeMath';
import { resolveIngredients } from '@apps/pinch/utils/resolveIngredient';
import {
  countOpenShopRows,
  getShoppingCost,
  getPlannedParts,
  getShoppingMeals,
  getShoppingSourceLabels,
  groupShoppingItems,
} from '@apps/pinch/utils/shopping';
import {
  getSettingsWithDefaults,
  getUsualDays,
} from '@apps/pinch/utils/settings';
import { getCollectionCounts } from '@apps/pinch/utils/collections';
import { sortFavoritesFirst } from '@apps/pinch/utils/favorites';
import { getShareKey, getShareStatus } from '@apps/pinch/utils/sharing';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const selectRecords = (state: RootState) => state.pinch.ingredients.records;
const selectFamilyItems = (state: RootState) => state.pinch.families.items;

export const selectIsPinchLoaded = (state: RootState) =>
  state.pinch.settings.isLoaded &&
  state.pinch.pinchSettings.isLoaded &&
  state.pinch.plannedMeals.isLoaded &&
  state.pinch.meals.isLoaded &&
  state.pinch.ingredients.isLoaded &&
  state.pinch.families.isLoaded &&
  state.pinch.stores.isLoaded &&
  state.pinch.products.isLoaded &&
  state.pinch.recipes.isLoaded &&
  state.pinch.sources.isLoaded;

/** Sources, collections, the shopping list, ideas, cooking history, recipe notes and fridge and freezer stock are optional extras: their failures are left out so each only takes its own UI away. */
export const selectPinchLoadError = (state: RootState) =>
  state.pinch.ingredients.loadError ??
  state.pinch.families.loadError ??
  state.pinch.stores.loadError ??
  state.pinch.products.loadError ??
  state.pinch.recipes.loadError;

export const selectIngredientRecordsById = createSelector(
  [selectRecords],
  (records) => new Map(records.map((record) => [record.id, record])),
);

/** Every ingredient, archived ones too, so whatever uses one still resolves it. */
export const selectAllIngredients = createSelector([selectRecords], (records) =>
  resolveIngredients(records),
);

/** The ingredients the person can pick, search and browse: catalog and custom, with their changes applied, archived ones left out. */
export const selectIngredients = createSelector(
  [selectAllIngredients],
  (ingredients) => ingredients.filter((ingredient) => !ingredient.isArchived),
);

export const selectIngredientsById = createSelector(
  [selectAllIngredients],
  (ingredients) =>
    new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
);

/** Catalog families and the person's own, alphabetical. */
export const selectIngredientFamilies = createSelector(
  [selectFamilyItems],
  (families): ResolvedFamily[] => {
    const all = [
      ...CATALOG_FAMILIES.map((family) => ({
        id: family.id,
        name: family.name,
        isCustom: false,
      })),
      ...families.map((family) => ({
        id: family.id,
        name: family.name,
        isCustom: true,
      })),
    ];
    const result = [...all].sort((a, b) => a.name.localeCompare(b.name));

    return result;
  },
);

export const selectIngredientFamiliesById = createSelector(
  [selectIngredientFamilies],
  (families) => new Map(families.map((family) => [family.id, family])),
);

const selectStoreItems = (state: RootState) => state.pinch.stores.items;

/** Every store, archived ones too, alphabetical, so a product still names where it was bought. */
export const selectAllStores = createSelector([selectStoreItems], (stores) =>
  [...stores].sort((a, b) => a.name.localeCompare(b.name)),
);

/** The stores the person can pick and manage. */
export const selectStores = createSelector([selectAllStores], (stores) =>
  stores.filter((store) => store.isArchived !== true),
);

export const selectStoresById = createSelector(
  [selectAllStores],
  (stores) => new Map(stores.map((store) => [store.id, store])),
);

const selectProductItems = (state: RootState) => state.pinch.products.items;

/** Every product, newest last, so "the first product" is the one added first. */
export const selectProducts = createSelector([selectProductItems], (products) =>
  [...products].sort((a, b) => a.createdAt - b.createdAt),
);

export const selectProductsById = createSelector(
  [selectProducts],
  (products) => new Map(products.map((product) => [product.id, product])),
);

export const selectProductsByIngredient = createSelector(
  [selectProducts],
  (products) =>
    products.reduce((acc, product) => {
      acc.set(product.ingredientId, [
        ...(acc.get(product.ingredientId) ?? []),
        product,
      ]);
      return acc;
    }, new Map<string, Product[]>()),
);

/** The product that prices each ingredient: the one its record points at, else the first one added. */
export const selectDefaultProducts = createSelector(
  [selectProductsByIngredient, selectRecords],
  (byIngredient, records) => {
    const pointers = new Map(
      records.map((record) => [record.id, record.defaultProductId ?? null]),
    );

    return new Map(
      [...byIngredient.entries()].map(([ingredientId, products]) => [
        ingredientId,
        products.find((product) => product.id === pointers.get(ingredientId)) ??
          products[0],
      ]),
    );
  },
);

export const selectProductCountsByStore = createSelector(
  [selectProducts],
  (products) =>
    products.reduce(
      (acc, product) =>
        acc.set(product.storeId, (acc.get(product.storeId) ?? 0) + 1),
      new Map<string, number>(),
    ),
);

const selectRecipeItems = (state: RootState) => state.pinch.recipes.items;

/** Every recipe, archived ones too, alphabetical, so a planned day or saved meal still resolves its title and cost. */
export const selectAllRecipes = createSelector([selectRecipeItems], (recipes) =>
  [...recipes].sort((a, b) => a.title.localeCompare(b.title)),
);

/** The recipes the person can list, search and plan. */
export const selectRecipes = createSelector([selectAllRecipes], (recipes) =>
  recipes.filter((recipe) => recipe.isArchived !== true),
);

export const selectRecipesById = createSelector(
  [selectAllRecipes],
  (recipes) => new Map(recipes.map((recipe) => [recipe.id, recipe])),
);

/** Ingredient ids ranked by how many of the person's recipes use them, worked out once per change of recipes. */
export const selectOftenUsedIngredientIds = createSelector(
  [selectRecipes],
  rankOftenUsedIngredients,
);

const selectSourceItems = (state: RootState) => state.pinch.sources.items;

export const selectSources = createSelector([selectSourceItems], (sources) =>
  [...sources].sort((a, b) => a.label.localeCompare(b.label)),
);

export const selectSourcesById = createSelector(
  [selectSources],
  (sources) => new Map(sources.map((source) => [source.id, source])),
);

export const selectSourcesLoadError = (state: RootState) =>
  state.pinch.sources.loadError;

export const selectSourceCounts = createSelector(
  [selectRecipes, selectSourcesById],
  (recipes, sourcesById) => {
    const bySource = recipes.reduce((acc, recipe) => {
      const source = getRecipeSource(recipe, sourcesById);
      return source ? acc.set(source.id, (acc.get(source.id) ?? 0) + 1) : acc;
    }, new Map<string, number>());
    const sourced = [...bySource.values()].reduce(
      (sum, count) => sum + count,
      0,
    );

    return { bySource, withoutSource: recipes.length - sourced };
  },
);

const selectCollectionItems = (state: RootState) =>
  state.pinch.collections.items;

export const selectCollections = createSelector(
  [selectCollectionItems],
  (collections) =>
    [...collections].sort((a, b) => a.label.localeCompare(b.label)),
);

export const selectCollectionsById = createSelector(
  [selectCollections],
  (collections) =>
    new Map(collections.map((collection) => [collection.id, collection])),
);

export const selectCollectionsLoadError = (state: RootState) =>
  state.pinch.collections.loadError;

/** Until it has loaded, or after it failed, the form leaves a recipe's collections as they are. */
export const selectIsCollectionsReady = (state: RootState) =>
  state.pinch.collections.isLoaded &&
  state.pinch.collections.loadError === null;

export const selectCollectionCounts = createSelector(
  [selectRecipes, selectCollections],
  getCollectionCounts,
);

const selectIdeaItems = (state: RootState) => state.pinch.ideas.items;

export const selectIdeas = createSelector([selectIdeaItems], (ideas) =>
  [...ideas].sort((a, b) => b.createdAt - a.createdAt),
);

export const selectIdeasById = createSelector(
  [selectIdeas],
  (ideas) => new Map(ideas.map((idea) => [idea.id, idea])),
);

export const selectIdeasLoadError = (state: RootState) =>
  state.pinch.ideas.loadError;

/** An idea is made only while its recipe is still on the person's lists: a deleted or archived recipe reads as not made yet. */
export const selectIdeaGroups = createSelector(
  [selectIdeas, selectRecipes],
  (ideas, recipes) => {
    const liveIds = new Set(recipes.map((recipe) => recipe.id));
    const isMade = (idea: Idea) =>
      idea.recipeId != null && liveIds.has(idea.recipeId);

    return {
      toTry: ideas.filter((idea) => !isMade(idea)),
      made: ideas.filter(isMade),
    };
  },
);

const selectCookItems = (state: RootState) => state.pinch.cooks.items;

export const selectCooksByRecipe = createSelector(
  [selectCookItems],
  groupCooksByRecipe,
);

export const selectCookSummaries = createSelector(
  [selectCookItems],
  getCookSummaries,
);

export const selectCooksById = createSelector(
  [selectCookItems],
  (cooks) => new Map(cooks.map((cook) => [cook.id, cook])),
);

export const selectCooksLoadError = (state: RootState) =>
  state.pinch.cooks.loadError;

const selectContainerItems = (state: RootState) => state.pinch.containers.items;

export const selectContainers = createSelector(
  [selectContainerItems],
  (containers) => [...containers].sort(byEatBy),
);

export const selectContainersById = createSelector(
  [selectContainers],
  (containers) =>
    new Map(containers.map((container) => [container.id, container])),
);

const selectStock = createSelector([selectContainers], getStockMaps);

export const selectStockByRecipe = createSelector(
  [selectStock],
  (stock) => stock.byRecipe,
);

export const selectStockByMeal = createSelector(
  [selectStock],
  (stock) => stock.byMeal,
);

export const selectContainersByCookId = createSelector(
  [selectContainers],
  groupContainersByCook,
);

export const selectContainersLoadError = (state: RootState) =>
  state.pinch.containers.loadError;

export const selectIsContainersReady = (state: RootState) =>
  state.pinch.containers.isLoaded && state.pinch.containers.loadError === null;

const selectPackageItems = (state: RootState) => state.pinch.packages.items;

/** What is in the pantry: soonest date first, no date last. */
export const selectPackages = createSelector([selectPackageItems], (packages) =>
  [...packages].sort(byUseBy),
);

export const selectPackagesById = createSelector(
  [selectPackages],
  (packages) => new Map(packages.map((pkg) => [pkg.id, pkg])),
);

/** The in-stock packages of each ingredient, soonest date first. */
export const selectPackagesByIngredient = createSelector(
  [selectPackages],
  groupPackagesByIngredient,
);

export const selectPackagesLoadError = (state: RootState) =>
  state.pinch.packages.loadError;

export const selectIsPackagesReady = (state: RootState) =>
  state.pinch.packages.isLoaded && state.pinch.packages.loadError === null;

/** Whether the person has ever put a package in the pantry, so a screen that would only be noise for someone who never has draws nothing. */
export const selectHasPackages = (state: RootState) =>
  state.pinch.packages.items.length > 0;

/** How many days ahead a package counts as due: the person's own lead days, the one window their morning note uses too. */
export const selectLeadDays = (state: RootState) =>
  state.pinch.pinchSettings.settings?.reminders.leadDays ?? DEFAULT_LEAD_DAYS;

const selectNoteItems = (state: RootState) => state.pinch.notes.items;

export const selectNotesByRecipe = createSelector(
  [selectNoteItems],
  groupNotesByRecipe,
);

export const selectNoteSummaries = createSelector(
  [selectNoteItems],
  getNoteSummaries,
);

export const selectNotesById = createSelector(
  [selectNoteItems],
  (notes) => new Map(notes.map((note) => [note.id, note])),
);

export const selectNotesLoadError = (state: RootState) =>
  state.pinch.notes.loadError;

/** Whether saving an edit to this recipe is recorded as a tweak; a string, so a component reading it re-renders only when the answer changes. */
export const selectTweakTracking = (
  state: RootState,
  recipeId: string | null,
) =>
  recipeId === null
    ? 'off'
    : getTweakTracking({
        isCooksReady:
          state.pinch.cooks.isLoaded && state.pinch.cooks.loadError === null,
        isNotesReady:
          state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
        cookCount: selectCookSummaries(state).get(recipeId)?.count ?? 0,
        noteCount: selectNoteSummaries(state).get(recipeId)?.count ?? 0,
      });

export const selectShoppingItems = (state: RootState) =>
  state.pinch.shopping.items;

export const selectShoppingLoadError = (state: RootState) =>
  state.pinch.shopping.loadError;

export const selectShoppingOpenCount = createSelector(
  [selectShoppingItems],
  countOpenShopRows,
);

export const selectShoppingById = createSelector(
  [selectShoppingItems],
  (items) => new Map(items.map((item) => [item.id, item])),
);

const selectHeldShoppingRows = (
  _state: RootState,
  held: ReadonlyMap<string, boolean>,
) => held;

export const selectShoppingRows = createSelector(
  [selectShoppingItems, selectIngredientsById, selectHeldShoppingRows],
  (items, ingredientsById, held) =>
    groupShoppingItems(items, ingredientsById, held),
);

export const selectShoppingCost = createSelector(
  [selectShoppingItems, selectIngredientsById, selectDefaultProducts],
  (items, ingredientsById, defaultProducts) =>
    getShoppingCost(
      items.filter((item) => !item.isChecked),
      ingredientsById,
      defaultProducts,
    ),
);

/** Every recipe's cost, computed once per change of recipes, ingredients or products. */
export const selectRecipeCosts = createSelector(
  [selectAllRecipes, selectIngredientsById, selectDefaultProducts],
  (recipes, ingredientsById, defaultProducts) =>
    new Map(
      recipes.map((recipe) => [
        recipe.id,
        getRecipeCost(recipe, ingredientsById, defaultProducts),
      ]),
    ),
);

const NO_DISMISSALS: Record<string, number> = {};

export const selectDismissedNudges = (state: RootState) =>
  state.pinch.settings.settings?.dismissedNudges ?? NO_DISMISSALS;

/** The ingredients a recipe, a saved meal or a day not yet frozen uses: the ones whose missing price changes a number, so a recipe line with no amount doesn't count. */
export const selectUsedIngredientIds = createSelector(
  [
    selectAllRecipes,
    (state: RootState) => state.pinch.meals.items,
    (state: RootState) => state.pinch.plannedMeals.items,
  ],
  (recipes, meals, plannedMeals) =>
    new Set([
      ...recipes.flatMap((recipe) =>
        recipe.ingredients.flatMap((line) =>
          line.amount === null ? [] : [line.ingredientId],
        ),
      ),
      ...[
        ...meals.flatMap((meal) => meal.items),
        ...plannedMeals
          .filter((planned) => planned.snapshot === null)
          .flatMap((planned) => planned.items),
      ]
        .filter((item) => item.kind === 'INGREDIENT')
        .map((item) => item.refId),
    ]),
);

export const selectPlannedMeals = (state: RootState) =>
  state.pinch.plannedMeals.items;

const MEAL_TYPE_ORDER = new Map(MEAL_TYPES.map((type, index) => [type, index]));

/** Day key to that day's planned meals in meal-type order, then in the order they were added: what every calendar cell and the day drawer read. */
export const selectPlannedByDay = createSelector(
  [selectPlannedMeals],
  (plannedMeals) => {
    const sorted = [...plannedMeals].sort(
      (a, b) =>
        (MEAL_TYPE_ORDER.get(a.mealType) ?? 0) -
          (MEAL_TYPE_ORDER.get(b.mealType) ?? 0) || a.createdAt - b.createdAt,
    );
    return sorted.reduce((byDay, meal) => {
      const key = getPlannedDayKey(meal.date);
      byDay.set(key, [...(byDay.get(key) ?? []), meal]);
      return byDay;
    }, new Map<string, PlannedMeal[]>());
  },
);

/** Every recipe's nutrition per serving, computed once per change of recipes or ingredients. */
export const selectRecipeNutrition = createSelector(
  [selectAllRecipes, selectIngredientsById],
  (recipes, ingredientsById) =>
    new Map(
      recipes.map((recipe) => [
        recipe.id,
        getRecipeNutrition(recipe, ingredientsById),
      ]),
    ),
);

/** What a meal's cost and nutrition are computed from, bundled so a component reads one value. */
export const selectCostContext = createSelector(
  [
    selectRecipeCosts,
    selectIngredientsById,
    selectDefaultProducts,
    selectRecipeNutrition,
  ],
  (recipeCosts, ingredientsById, defaultProducts, recipeNutrition) => ({
    recipeCosts,
    ingredientsById,
    defaultProducts,
    recipeNutrition,
  }),
);

const selectMealItems = (state: RootState) => state.pinch.meals.items;

export const selectMeals = createSelector([selectMealItems], (meals) =>
  sortFavoritesFirst([...meals].sort((a, b) => b.createdAt - a.createdAt)),
);

export const selectStockByMealWithRecipes = createSelector(
  [selectMeals, selectStockByRecipe, selectStockByMeal],
  getMealStockMap,
);

export const selectMealsById = createSelector(
  [selectMeals],
  (meals) => new Map(meals.map((meal) => [meal.id, meal])),
);

/** The names behind what put each line on the shopping list, computed once per change of the list, the plan, recipes or saved meals. */
export const selectShoppingSourceLabels = createSelector(
  [
    selectShoppingItems,
    selectPlannedMeals,
    selectRecipesById,
    selectMealsById,
    selectIngredientsById,
  ],
  getShoppingSourceLabels,
);

export const selectShoppingPlannedParts = createSelector(
  [
    selectShoppingItems,
    selectPlannedMeals,
    selectRecipesById,
    selectIngredientsById,
  ],
  getPlannedParts,
);

export const selectShoppingSourceContext = createSelector(
  [
    selectPlannedMeals,
    selectMealsById,
    selectRecipesById,
    selectIngredientsById,
  ],
  (plannedMeals, mealsById, recipesById, ingredientsById) => ({
    plannedById: new Map(plannedMeals.map((meal) => [meal.id, meal])),
    mealsById,
    recipesById,
    ingredientsById,
  }),
);

export const selectShoppingMeals = createSelector(
  [
    selectShoppingItems,
    selectShoppingSourceLabels,
    (_state: RootState, todayKey: string) => todayKey,
  ],
  getShoppingMeals,
);

/** The shown period's spend, average per meal and breakdowns, computed once per change of meals, prices or days shown. */
export const selectPeriodStats = createSelector(
  [
    selectPlannedMeals,
    selectCostContext,
    (_state: RootState, startKey: string) => startKey,
    (_state: RootState, _startKey: string, endKey: string) => endKey,
  ],
  (plannedMeals, context, startKey, endKey) =>
    getPeriodStats(plannedMeals, { startKey, endKey }, context),
);

const NO_SWITCHES = {
  calories: false,
  protein: false,
  carbs: false,
  fat: false,
};

/** Which nutrition metrics the person has switched on; all off until they do. */
export const selectShowNutrition = (state: RootState) =>
  state.pinch.settings.settings?.showNutrition ?? NO_SWITCHES;

const selectPinchSettingsDocument = (state: RootState) =>
  state.pinch.pinchSettings.settings;

/** The person's reminders and keeping days; the defaults until a document exists, and under a document written before a key existed, that key's default (a reminder kind it predates reads off). */
export const selectPinchSettings = createSelector(
  [selectPinchSettingsDocument],
  getSettingsWithDefaults,
);

/** Set when the settings document couldn't be read; the defaults then stand in for choices the person made, so Settings draws nothing to change. */
export const selectPinchSettingsLoadError = (state: RootState) =>
  state.pinch.pinchSettings.loadError;

/** Set when the kitchen document (the four nutrition switches) couldn't be read; the all-off defaults then stand in for choices the person made. */
export const selectNutritionLoadError = (state: RootState) =>
  state.pinch.settings.loadError;

/** Whether the kitchen document exists, so the first nutrition change creates it and later ones write only their own fields. */
export const selectHasKitchenSettings = (state: RootState) =>
  state.pinch.settings.settings !== null;

/** Whether a document exists, so the first change writes the whole thing and later ones only their fields. */
export const selectHasPinchSettings = (state: RootState) =>
  state.pinch.pinchSettings.settings !== null;

/** The days a new fridge or freezer box starts with. */
export const selectUsualDays = createSelector(
  [
    (state: RootState) => state.pinch.pinchSettings.settings?.fridgeDays,
    (state: RootState) => state.pinch.pinchSettings.settings?.freezerDays,
  ],
  (fridgeDays, freezerDays) =>
    getUsualDays({
      fridgeDays: fridgeDays ?? null,
      freezerDays: freezerDays ?? null,
    }),
);

const selectShareItems = (state: RootState) => state.pinch.shares.items;

/** The person's links, the latest copy first. */
export const selectShares = createSelector([selectShareItems], (shares) =>
  [...shares].sort((a, b) => b.updatedAt - a.updatedAt),
);

export const selectSharesBySource = createSelector(
  [selectShareItems],
  (shares) =>
    new Map(
      shares.map((share) => [getShareKey(share.kind, share.sourceId), share]),
    ),
);

export const selectShareBySource =
  (kind: ShareKind, sourceId: string) => (state: RootState) =>
    selectSharesBySource(state).get(getShareKey(kind, sourceId)) ?? null;

/** Whether each link's original is gone and whether it changed since the copy was taken, by the link's id. */
export const selectShareStatuses = createSelector(
  [selectShares, selectRecipesById, selectMealsById, selectNotesByRecipe],
  (shares, recipesById, mealsById, notesByRecipe) =>
    new Map(
      shares.map((share) => [
        share.id,
        getShareStatus(share, recipesById, mealsById, notesByRecipe),
      ]),
    ),
);

/** Tips and notes travel with a share when the owner includes them, so such a copy is only taken once they have loaded: otherwise an update would quietly drop them. Null when it is safe, else the reason. */
export const selectShareNotesBlock = (state: RootState): string | null => {
  if (state.pinch.notes.loadError !== null) {
    return "Your tips and notes couldn't load, so a link made now would leave them out. Try again in a moment.";
  }
  return state.pinch.notes.isLoaded
    ? null
    : 'Your tips and notes are still loading. Try again in a moment.';
};

export const selectSharesLoadError = (state: RootState) =>
  state.pinch.shares.loadError;

/** Until it has loaded, or after it failed, whether a recipe is already shared isn't known. */
export const selectIsSharesReady = (state: RootState) =>
  state.pinch.shares.isLoaded && state.pinch.shares.loadError === null;
