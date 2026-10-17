import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getEntryGrams,
  getServingGrams,
  scaleNutrition,
  toPer100g,
} from '../../src/apps/pinch/utils/nutritionBasis.ts';
import { scaleAmount } from '../../src/apps/pinch/utils/quantity.ts';
import {
  buildRepricedSnapshot,
  buildSnapshot,
  getRepricedAt,
  getRepricePreview,
  wouldRepriceChange,
  type CostContext,
} from '../../src/apps/pinch/utils/mealMath.ts';
import { countLeftOutIngredients } from '../../src/apps/pinch/utils/gaps.ts';
import {
  getCookedRecipeIds,
  getPlannedMealOffer,
  isPlannedMealCooked,
} from '../../src/apps/pinch/components/calendar/plannedMealOffer.ts';
import {
  formatCostTile,
  formatRowPrice,
  getFixedNote,
  getPlannedMealTitle,
  getPlateTitle,
  getRepriceLines,
} from '../../src/apps/pinch/utils/mealFormat.ts';
import { getRecipeNutrition } from '../../src/apps/pinch/utils/nutritionMath.ts';
import { getRecipeCost } from '../../src/apps/pinch/utils/recipeMath.ts';
import {
  getBuilderNote,
  getDefaultMealType,
  getNearDayOptions,
  getOfferablePicks,
  getPlanDayWord,
  getRecentRowWindow,
  getWhenSummary,
  rankRecentPicks,
} from '../../src/apps/pinch/utils/planPicks.ts';
import {
  getComparableUrl,
  getWebLinkHost,
  hasSeveralWebLinks,
  toWebLink,
} from '../../src/utils/urlUtils.ts';
import {
  CONTAINER_EVENT_KINDS,
  MAX_CONTAINERS_PER_PUT_AWAY,
  MAX_CONTAINER_HISTORY,
  MAX_CONTAINER_NOTE_LENGTH,
  MAX_CONTAINER_SERVINGS,
  MAX_CONTAINER_TITLE_LENGTH,
  MAX_EAT_BY_DATE,
  MIN_EAT_BY_DATE,
} from '../../src/apps/pinch/constants.ts';
import {
  describeUsage,
  getRecipeUsage,
  isInUse,
} from '../../src/apps/pinch/utils/references.ts';
import {
  appendEvent,
  getFinishedText,
  formatStockAmount,
  getMealStockMap,
  getMoveNotes,
  getStartServings,
  buildContainer,
  getContainerTitle,
  getDaysLeft,
  getDueText,
  getEatByDefault,
  getEatByHint,
  getEatByPhrase,
  getEatByState,
  getFreezeCount,
  getFreezeLine,
  getLastPlaceEvent,
  getNewContainerProblem,
  getPlacesText,
  getPreparedSummary,
  getContainerCountMax,
  getNewContainersProblem,
  getPutAwayBasis,
  getPutAwayServings,
  getSplitText,
  groupSavedBatches,
  planCount,
  splitServings,
  getPutAwayText,
  getSavedHeadline,
  getSavedText,
  getServingsToEat,
  getShoppingStockLine,
  getStockDetail,
  getStockMaps,
  getStockParts,
  getStockPlaceCounts,
  getStockTitle,
  hasStockIn,
  groupContainersByCook,
  isBulkMeal,
  isValidContainerServings,
  isValidEatBy,
  makeEvent,
  planEat,
  planEatBy,
  planMove,
  planToss,
  planUndoEnd,
  planClear,
  planClearOut,
  getClearOutMessage,
  getFinishedDoor,
  getPutBackText,
  getEventText,
} from '../../src/apps/pinch/utils/containers.ts';
import {
  getCookId,
  getCookServings,
  getCookSummaries,
  getMarkableRecipes,
  getMissingCookFields,
  getPlannedCookId,
  getPlannedCookedAt,
  groupCooksByRecipe,
  isCookHistoryFull,
  isValidCookServings,
  mergePlannedCook,
} from '../../src/apps/pinch/utils/cooks.ts';
import {
  getCookChoiceLabels,
  getMissingNoteFields,
  getNoteSummary,
  getNoteCookChoices,
  getNoteSummaries,
  getTweakReason,
  getTweakTracking,
  getWrittenBefore,
  groupNotesByRecipe,
  isNoteHistoryFull,
  isValidNoteText,
} from '../../src/apps/pinch/utils/notes.ts';
import {
  getRecipeChanges,
  type RecipeContent,
} from '../../src/apps/pinch/utils/recipeChanges.ts';
import { normalizeExtractedRecipe } from '../../src/apps/pinch/utils/normalizeRecipe.ts';
import {
  EMPTY_CARE_TEXT,
  formatCareDays,
  getCareProblem,
  getCareSummary,
  getCareText,
  getLeftoversLine,
  getRecipeCare,
  parseCareText,
  toCare,
} from '../../src/apps/pinch/utils/recipeCare.ts';
import { toLocalDateInputValue } from '../../src/utils/dateInputUtils.ts';
import {
  DEFAULT_LIST_VIEW_OPTIONS,
  countCustomizedViewOptions,
  parseListViewOptions,
} from '../../src/apps/pinch/hooks/useListViewOptions.ts';
import {
  findIdeaByUrl,
  getIdeaDetail,
  getIdeaRecipeMethod,
  getIdeaSearchText,
  getMissingIdeaFields,
  getReadingForIdea,
  toIdeaImageUrl,
  toIdeaUrl,
} from '../../src/apps/pinch/utils/ideas.ts';
import {
  getItemsLines,
  getMergedFields,
  getRecipeLines,
  getShoppingCost,
  getShoppingItemId,
  getShownShoppingView,
  groupShoppingItems,
  isValidAmount,
  mergeLines,
  roundAmount,
} from '../../src/apps/pinch/utils/shopping.ts';
import type { ExtractedRecipe } from '../../src/apps/pinch/utils/normalizeRecipe.ts';
import type {
  Container,
  ContainerEvent,
  Cook,
  Idea,
  MealItem,
  Gap,
  PlannedMeal,
  PlannedSnapshot,
  Product,
  Recipe,
  RecipeNote,
  ResolvedIngredient,
  ShoppingItem,
  ShoppingView,
  Unit,
} from '../../src/apps/pinch/types.ts';
import {
  getIngredientUses,
  getPackageUnit,
  getUseText,
  rankGaps,
} from '../../src/apps/pinch/utils/gapOrder.ts';
import { getPlanInRange as shopGetPlanInRange } from '../../src/apps/pinch/utils/shopping.ts';
import type { PlannedMeal as ShopPlannedMeal } from '../../src/apps/pinch/types.ts';
import {
  CATALOG_FAMILIES as SHOP_CATALOG_FAMILIES,
  CATALOG_INGREDIENTS_BY_ID as SHOP_CATALOG_BY_ID,
} from '../../src/apps/pinch/catalog/index.ts';
import {
  SHOP_SECTION_BY_FAMILY as SHOP_BY_FAMILY,
  SHOP_SECTION_BY_INGREDIENT as SHOP_BY_INGREDIENT,
  SHOP_SECTIONS as SHOP_SECTION_IDS,
} from '../../src/apps/pinch/constants.ts';
import { getShopSection as shopGetSection } from '../../src/apps/pinch/utils/shopping.ts';
import {
  getShopAmount as shopAmountOf,
  groupShopLines as shopGroupLines,
  groupShoppingItems as shopGroupItems,
} from '../../src/apps/pinch/utils/shopping.ts';
import { isUsuallyAtHome as shopIsAtHome } from '../../src/apps/pinch/utils/shopping.ts';
import { CATALOG_INGREDIENTS as SHOP_CATALOG } from '../../src/apps/pinch/catalog/index.ts';
import { searchIngredients as shopSearch } from '../../src/apps/pinch/utils/catalogSearch.ts';
import {
  getShoppingCost as shopCostOf,
  getShoppingCostCoverage as shopCoverage,
} from '../../src/apps/pinch/utils/shopping.ts';
import {
  formatRecipeUnitEcho as kitaEcho,
  formatUnitPrice as kitaUnitPrice,
} from '../../src/apps/pinch/utils/productFormat.ts';
import {
  buildRecipeSearchIndex as r2BuildIndex,
  searchRecipes as r2Search,
} from '../../src/apps/pinch/utils/catalogSearch.ts';
import { getCountChangeCopy as kitbCountCopy } from '../../src/apps/pinch/utils/containers.ts';
import {
  getBatchKey as kitbBatchKey,
  getBatchServingsText as kitbServingsText,
  getBoxCountCopy as kitbBoxCopy,
  groupBatches as kitbGroup,
} from '../../src/apps/pinch/utils/containers.ts';
import { getEatByLabel as kitbEatByLabel } from '../../src/apps/pinch/utils/containers.ts';
import { canPutBack as kitbCanPutBack } from '../../src/apps/pinch/utils/containers.ts';
import {
  getFrozenAt as kitbFrozenAt,
  isEatByShown as kitbIsEatByShown,
} from '../../src/apps/pinch/utils/containers.ts';
import { getFrozenText as kitbFrozenText } from '../../src/apps/pinch/utils/containers.ts';
import {
  getSourcedLines as srcSourcedLines,
  mergeSourcedLines as srcMergeLines,
  mergeSources as srcMergeSources,
  type SourcedLine,
} from '../../src/apps/pinch/utils/shopping.ts';
import { MAX_SHOPPING_SOURCES as SRC_MAX } from '../../src/apps/pinch/constants.ts';
import {
  formatSourceDay as srcDay,
  formatSourceNames as srcNames,
  getOnListHint as srcHint,
  getRowOnList as srcRowOnList,
  parseShoppingSource as srcParse,
} from '../../src/apps/pinch/utils/shopping.ts';
import { getDayOnList as srcDayOnList } from '../../src/apps/pinch/utils/shopping.ts';
import {
  getShoppingSourceLabels as srcLabels,
  getShoppingSourcesText as srcText,
} from '../../src/apps/pinch/utils/shopping.ts';
import {
  getShoppingMeals as stopMeals,
  getShoppingSourceLabels as stopLabels,
  getSourceLines as stopSourceLines,
  getSourceNames as stopNames,
  formatShopAmount as stopAmountText,
  getPlannedParts as stopParts,
  getShoppingMealsText as stopMealsText,
  getRowSourceShares as stopRowShares,
  getSourceShares as stopShares,
  isAsStopLeft as stopAsLeft,
  joinSourceNames as stopJoin,
  planStopShopping as stopPlan,
} from '../../src/apps/pinch/utils/shopping.ts';
import type { Meal as SrcMeal } from '../../src/apps/pinch/types.ts';
import {
  SHOPPING_VIEW_LABELS as designShopLabels,
  SHOPPING_VIEWS as designShopViews,
} from '../../src/apps/pinch/constants.ts';

const ingredient = (
  id: string,
  gramsPerMl: number | null = null,
  gramsEach: number | null = null,
) => ({ id, gramsPerMl, gramsEach }) as ResolvedIngredient;

const product = (
  ingredientId: string,
  priceCents: number,
  sizeAmount: number,
  sizeUnit: Unit,
) => ({ ingredientId, priceCents, sizeAmount, sizeUnit }) as Product;

const recipe = (servings: number, lines: [string, number, Unit][]) =>
  ({
    servings,
    ingredients: lines.map(([ingredientId, amount, unit], index) => ({
      id: `line-${index}`,
      ingredientId,
      amount,
      unit,
    })),
  }) as Recipe;

const cost = (
  r: Recipe,
  ingredients: ResolvedIngredient[],
  products: Product[],
) =>
  getRecipeCost(
    r,
    new Map(ingredients.map((i) => [i.id, i])),
    new Map(products.map((p) => [p.ingredientId, p])),
  );

const chicken = ingredient('chicken');
const chickenProduct = product('chicken', 948, 3, 'LB');

const mass = cost(
  recipe(4, [['chicken', 2, 'LB']]),
  [chicken],
  [chickenProduct],
);
assert.equal(
  Math.round(mass.totalCents ?? 0),
  632,
  '2 lb of $9.48 / 3 lb is $6.32',
);
assert.equal(Math.round(mass.perServingCents ?? 0), 158);

const noBridge = cost(
  recipe(4, [['chicken', 1, 'CUP']]),
  [chicken],
  [chickenProduct],
);
assert.equal(
  noBridge.totalCents,
  null,
  'a cup of a weighed product with no density has no price',
);
assert.equal(noBridge.leftOut[0]?.kind, 'NOT_COMPARABLE');

const noProduct = cost(
  recipe(2, [
    ['chicken', 1, 'LB'],
    ['salt', 1, 'TSP'],
  ]),
  [chicken, ingredient('salt')],
  [chickenProduct],
);
assert.equal(noProduct.leftOut.length, 1);
assert.equal(noProduct.leftOut[0]?.kind, 'NO_PRODUCT');
assert.equal(Math.round(noProduct.totalCents ?? 0), 316);

const eggs = ingredient('egg', null, 50);
const eachVsEach = cost(
  recipe(1, [['egg', 3, 'EACH']]),
  [eggs],
  [product('egg', 600, 12, 'EACH')],
);
assert.equal(
  Math.round(eachVsEach.totalCents ?? 0),
  150,
  'each against each is a plain ratio',
);

const viaPiece = cost(
  recipe(1, [['egg', 150, 'G']]),
  [eggs],
  [product('egg', 600, 12, 'EACH')],
);
assert.equal(
  Math.round(viaPiece.totalCents ?? 0),
  150,
  'grams reach a per-piece price through grams each',
);

const milk = ingredient('milk', 1.03);
const viaDensity = cost(
  recipe(1, [['milk', 1, 'CUP']]),
  [milk],
  [product('milk', 400, 1, 'L')],
);
assert.equal(
  Math.round(viaDensity.totalCents ?? 0),
  95,
  'a cup (236.588 ml) of $4/L milk is 95c',
);

const massToVolume = cost(
  recipe(1, [['milk', 500, 'G']]),
  [milk],
  [product('milk', 400, 1, 'L')],
);
assert.equal(
  Math.round(massToVolume.totalCents ?? 0),
  194,
  '500 g at 1.03 g/ml priced per litre',
);

const empty = cost(recipe(2, []), [], []);
assert.equal(empty.totalCents, null);
assert.equal(empty.leftOut.length, 0);

const noConversions = { gramsPerMl: null, gramsEach: null };
const per28g = getEntryGrams(28, 'G', null) ?? 0;
assert.equal(
  toPer100g(130, per28g),
  464.29,
  '130 cal per 28 g is 464.29 per 100 g',
);
assert.equal(toPer100g(3.3, 100), 3.3, 'per 100 g is stored exactly as typed');
assert.equal(
  toPer100g(100, getEntryGrams(1, 'OZ', null) ?? 0),
  352.74,
  '100 cal per ounce is 352.74 per 100 g',
);

const fiveOunces = getServingGrams({ amount: 5, unit: 'OZ' }, noConversions);
assert.equal(Math.round((fiveOunces ?? 0) * 100) / 100, 141.75);
assert.equal(
  toPer100g(200, getEntryGrams(1, 'SERVING', fiveOunces) ?? 0),
  141.1,
  '200 cal per 5 oz serving is 141.1 per 100 g',
);
assert.equal(
  toPer100g(200, getEntryGrams(2, 'SERVING', 100) ?? 0),
  100,
  'two 100 g servings halve the label',
);

assert.equal(
  getServingGrams({ amount: 1, unit: 'CUP' }, noConversions),
  null,
  'a cup of an ingredient with no density has no weight',
);
assert.equal(
  getEntryGrams(1, 'SERVING', null),
  null,
  'a serving that cannot be weighed has no grams',
);
assert.equal(
  Math.round(
    (getServingGrams(
      { amount: 1, unit: 'CUP' },
      { gramsPerMl: 1.03, gramsEach: null },
    ) ?? 0) * 10,
  ) / 10,
  243.7,
  'a cup of 1.03 g/ml milk weighs 243.7 g',
);
assert.equal(
  getServingGrams(
    { amount: 2, unit: 'EACH' },
    { gramsPerMl: null, gramsEach: 50 },
  ),
  100,
  'two eggs of 50 g are 100 g',
);

const scaled = scaleNutrition(
  { calories: 200, protein: 10, carbs: null, fat: 5 },
  1.5,
);
assert.deepEqual(scaled, { calories: 300, protein: 15, carbs: null, fat: 7.5 });

// Shopping list lines
const shopIngredient = (
  id: string,
  name: string,
  familyId: string | null,
  serving: { amount: number; unit: Unit },
) =>
  ({
    id,
    name,
    familyId,
    serving,
    gramsPerMl: null,
    gramsEach: null,
  }) as ResolvedIngredient;

const shopIngredients = new Map(
  [
    shopIngredient('rice', 'Rice', 'fam-rice', { amount: 0.25, unit: 'CUP' }),
    shopIngredient('chicken', 'Chicken', 'fam-chicken', {
      amount: 4,
      unit: 'OZ',
    }),
    shopIngredient('chips', 'Chips', null, { amount: 28, unit: 'G' }),
    shopIngredient('salt', 'Salt', 'fam-gone', { amount: 1, unit: 'TSP' }),
  ].map((entry) => [entry.id, entry]),
);

const shopRecipe = (
  id: string,
  servings: number,
  lines: [string, number, Unit][],
) =>
  ({
    ...recipe(servings, lines),
    id,
  }) as Recipe;

const adobo = shopRecipe('adobo', 4, [
  ['chicken', 2, 'LB'],
  ['rice', 1, 'CUP'],
  ['salt', 1, 'TSP'],
  ['gone', 3, 'EACH'],
]);
const ricePot = shopRecipe('ricePot', 2, [
  ['rice', 0.5, 'CUP'],
  ['rice', 8, 'TBSP'],
]);
const shopRecipes = new Map([adobo, ricePot].map((entry) => [entry.id, entry]));

assert.equal(getShoppingItemId('cat-salt', 'FL_OZ'), 'cat-salt__FL_OZ');

// Scaling a recipe's amounts to the servings being made (cooking mode and the shopping sheet share it)
assert.equal(scaleAmount(2, 6, 4), 3);
assert.equal(scaleAmount(1, 6, 4), 1.5);
assert.equal(scaleAmount(0.25, 1, 4), 0.0625);
assert.equal(scaleAmount(3, 4, 4), 3);
assert.equal(scaleAmount(2, 6, 0), 2);
assert.equal(scaleAmount(2, 6, -1), 2);
assert.deepEqual(
  getRecipeLines(
    shopRecipe('noServings', 0, [['rice', 1, 'CUP']]),
    shopIngredients,
    6,
  ),
  [],
  'a shopping line for a recipe with no servings is left out',
);

assert.deepEqual(
  getRecipeLines(adobo, shopIngredients),
  [
    { ingredientId: 'chicken', amount: 2, unit: 'LB' },
    { ingredientId: 'rice', amount: 1, unit: 'CUP' },
    { ingredientId: 'salt', amount: 1, unit: 'TSP' },
  ],
  'a recipe at its own servings is its own lines, and an ingredient that is gone is left out',
);
assert.deepEqual(
  getRecipeLines(adobo, shopIngredients, 6).map((line) => line.amount),
  [3, 1.5, 1.5],
  'six servings of a four-serving recipe scales every line by 1.5',
);
assert.deepEqual(
  getRecipeLines(adobo, shopIngredients, 0.5).map((line) => line.amount),
  [0.25, 0.13, 0.13],
  'half a serving rounds to two decimals',
);
assert.deepEqual(
  getRecipeLines(ricePot, shopIngredients),
  [
    { ingredientId: 'rice', amount: 0.5, unit: 'CUP' },
    { ingredientId: 'rice', amount: 8, unit: 'TBSP' },
  ],
  'the same ingredient in two units stays two lines: units are never converted',
);

const mealItem = (
  id: string,
  kind: MealItem['kind'],
  refId: string,
  servings: number,
): MealItem => ({ id, kind, refId, servings });
const dayLines = getItemsLines(
  [
    mealItem('a', 'RECIPE', 'adobo', 2),
    mealItem('b', 'RECIPE', 'ricePot', 2),
    mealItem('c', 'INGREDIENT', 'rice', 3),
    mealItem('d', 'INGREDIENT', 'chips', 3),
    mealItem('e', 'RECIPE', 'deleted-recipe', 1),
    mealItem('f', 'INGREDIENT', 'deleted-ingredient', 1),
  ],
  shopRecipes,
  shopIngredients,
);
assert.deepEqual(
  dayLines,
  [
    { ingredientId: 'chicken', amount: 1, unit: 'LB' },
    { ingredientId: 'rice', amount: 1.75, unit: 'CUP' },
    { ingredientId: 'salt', amount: 0.5, unit: 'TSP' },
    { ingredientId: 'rice', amount: 8, unit: 'TBSP' },
    { ingredientId: 'chips', amount: 84, unit: 'G' },
  ],
  'a day sums recipe items scaled by servings and ingredient items at their serving size, per ingredient and unit',
);
assert.deepEqual(
  mergeLines([
    { ingredientId: 'rice', amount: 1 / 3, unit: 'CUP' },
    { ingredientId: 'rice', amount: 1 / 3, unit: 'CUP' },
    { ingredientId: 'rice', amount: 1 / 3, unit: 'CUP' },
    { ingredientId: 'salt', amount: 0.001, unit: 'TSP' },
  ]),
  [{ ingredientId: 'rice', amount: 1, unit: 'CUP' }],
  'thirds add up to one before rounding, and a line that rounds to nothing is dropped',
);

const shopItem = (
  ingredientId: string,
  unit: Unit,
  amount: number,
  isChecked: boolean,
): ShoppingItem => ({
  id: getShoppingItemId(ingredientId, unit),
  ingredientId,
  amount,
  unit,
  isChecked,
  createdAt: 1,
  updatedAt: 1,
});
const shopSectionIngredients = new Map([
  ...shopIngredients,
  ...[
    shopIngredient('rice', 'Rice', 'cat-fam-rice', {
      amount: 0.25,
      unit: 'CUP',
    }),
    shopIngredient('chicken', 'Chicken', 'cat-fam-chicken', {
      amount: 4,
      unit: 'OZ',
    }),
  ].map((entry) => [entry.id, entry] as const),
]);
const grouped = groupShoppingItems(
  [
    shopItem('chips', 'G', 28, false),
    shopItem('rice', 'CUP', 1, false),
    shopItem('salt', 'TSP', 1, false),
    shopItem('chicken', 'LB', 2, false),
    shopItem('chicken', 'OZ', 4, false),
    shopItem('missing', 'EACH', 2, false),
    shopItem('rice', 'LB', 5, true),
  ],
  shopSectionIngredients,
);
assert.deepEqual(
  grouped.toBuy.map((group) => [group.name, group.rows.map((row) => row.name)]),
  [
    ['Meat & fish', ['Chicken']],
    ['Pantry', ['Rice']],
    ['Other', ['Chips', 'Removed ingredient', 'Salt']],
  ],
  'groups follow the shop sections in walking order, and an ingredient with no family or an unknown one, or one that is gone, lands in Other',
);
assert.deepEqual(
  grouped.toBuy[0].rows.map((row) => [row.itemIds, row.amountText]),
  [[['chicken__LB', 'chicken__OZ'], '2.25 lb']],
  'one ingredient in two weights is one row that stands for both items, largest first, summed in its unit',
);
assert.deepEqual(
  grouped.got.map((group) => [
    group.name,
    group.rows.map((row) => row.itemIds),
  ]),
  [['Pantry', [['rice__LB']]]],
  'a checked item is in "Got it", grouped by its section, and not in "To buy"',
);

const heldItems = [
  shopItem('rice', 'CUP', 1, true),
  shopItem('salt', 'TSP', 1, false),
  shopItem('chips', 'G', 28, true),
];
const heldGrouped = groupShoppingItems(
  heldItems,
  shopSectionIngredients,
  new Map([
    ['rice__CUP', false],
    ['salt__TSP', true],
  ]),
);
assert.deepEqual(
  heldGrouped.toBuy.map((group) => [
    group.name,
    group.rows.map((row) => [row.itemIds[0], row.isChecked]),
  ]),
  [['Pantry', [['rice__CUP', true]]]],
  'a row just ticked stays in its group, still carrying its stored checked flag',
);
assert.deepEqual(
  heldGrouped.got.map((group) => [
    group.name,
    group.rows.map((row) => [row.itemIds[0], row.isChecked]),
  ]),
  [
    [
      'Other',
      [
        ['chips__G', true],
        ['salt__TSP', false],
      ],
    ],
  ],
  'a row just unticked stays in "Got it" until it is let go, and the unheld rows follow the stored flag',
);
assert.deepEqual(
  groupShoppingItems(heldItems, shopSectionIngredients, new Map()),
  groupShoppingItems(heldItems, shopSectionIngredients),
  'an empty hold changes nothing',
);

const shopPick = (view: ShoppingView, query = '') => ({ view, query });
assert.equal(
  getShownShoppingView(shopPick('toBuy'), '', { toBuy: 0, got: 4 }),
  'toBuy',
  'with no search the pick is kept, even when its view is empty',
);
assert.equal(
  getShownShoppingView(shopPick('toBuy'), 'milk', { toBuy: 0, got: 1 }),
  'got',
  'a search that matches nothing to buy but something got shows "Got it"',
);
assert.equal(
  getShownShoppingView(shopPick('got'), 'milk', { toBuy: 2, got: 0 }),
  'toBuy',
  'and the other way round',
);
assert.equal(
  getShownShoppingView(shopPick('toBuy'), 'milk', { toBuy: 1, got: 3 }),
  'toBuy',
  'a search with a match in the picked view stays there',
);
assert.equal(
  getShownShoppingView(shopPick('got'), 'zz', { toBuy: 0, got: 0 }),
  'got',
  'a search that matches nothing anywhere keeps the pick',
);
assert.equal(
  getShownShoppingView(shopPick('toBuy', 'milk'), 'milk', {
    toBuy: 0,
    got: 1,
  }),
  'toBuy',
  'a view picked while that text was typed is kept, so tapping its pill always takes',
);
assert.equal(
  getShownShoppingView(shopPick('toBuy', 'milk'), 'milk powder', {
    toBuy: 0,
    got: 1,
  }),
  'got',
  'typing on after picking lets the search switch again',
);

const shopCost = getShoppingCost(
  [
    { ingredientId: 'chicken', amount: 2, unit: 'LB' },
    { ingredientId: 'rice', amount: 1, unit: 'CUP' },
    { ingredientId: 'salt', amount: 1, unit: 'TSP' },
    { ingredientId: 'salt', amount: 2, unit: 'G' },
  ],
  shopIngredients,
  new Map([['chicken', chickenProduct]]),
);
assert.equal(
  Math.round(shopCost.totalCents ?? 0),
  632,
  'the list prices the amounts that have a product',
);
assert.deepEqual(
  shopCost.leftOut.map((gap) => `${gap.kind}:${gap.ingredientId}`),
  ['NO_PRODUCT:rice', 'NO_PRODUCT:salt'],
  'what has no product is left out once per ingredient',
);
assert.equal(
  getShoppingCost([], shopIngredients, new Map()).totalCents,
  null,
  'an empty list has no price',
);
assert.equal(
  getShoppingCost(
    [{ ingredientId: 'chicken', amount: 1, unit: 'CUP' }],
    shopIngredients,
    new Map([['chicken', chickenProduct]]),
  ).leftOut[0]?.kind,
  'NOT_COMPARABLE',
  'a unit that cannot be compared with the package is left out',
);

// Merging a line into an item
const NOW = 1_800_000_000_000;
const flour = (amount: number) => ({
  ingredientId: 'flour',
  amount,
  unit: 'CUP' as Unit,
});
assert.deepEqual(
  getMergedFields(null, flour(1.5), NOW),
  { amount: 1.5, isChecked: false, updatedAt: NOW },
  'a new line starts unchecked with its amount',
);
assert.deepEqual(
  getMergedFields({ amount: 0.1, isChecked: false }, flour(0.2), NOW),
  { amount: 0.3, isChecked: false, updatedAt: NOW },
  'an open item gains the amount, rounded to two decimals',
);
assert.deepEqual(
  getMergedFields({ amount: 5, isChecked: true }, flour(2), NOW),
  { amount: 2, isChecked: false, updatedAt: NOW },
  'an item already checked off starts again with only the new amount',
);
assert.equal(
  getMergedFields({ amount: 999_999.5, isChecked: false }, flour(5), NOW)
    .amount,
  1_000_000,
  'an open item stops at the cap',
);
assert.equal(
  getMergedFields(null, flour(2_000_000), NOW).amount,
  1_000_000,
  'a new item stops at the cap',
);
assert.equal(
  getMergedFields({ amount: 5, isChecked: true }, flour(2_000_000), NOW).amount,
  1_000_000,
  'a restarted item stops at the cap',
);
assert.deepEqual(
  mergeLines([flour(600_000), flour(600_000)]),
  [flour(1_000_000)],
  'lines that add past the cap stop at it',
);

// Moving a line to another unit carries whether it was checked off
assert.equal(
  getMergedFields(null, flour(8), NOW, true).isChecked,
  true,
  'a checked line moved into a unit with no item stays checked',
);
assert.equal(
  getMergedFields(null, flour(8), NOW, false).isChecked,
  false,
  'an open line moved into a unit with no item stays open',
);
assert.deepEqual(
  getMergedFields({ amount: 4, isChecked: false }, flour(8), NOW, true),
  { amount: 12, isChecked: false, updatedAt: NOW },
  'moving into an open item adds to it and it stays open, whichever way the moved line was',
);
assert.deepEqual(
  getMergedFields({ amount: 4, isChecked: true }, flour(8), NOW, true),
  { amount: 8, isChecked: false, updatedAt: NOW },
  'moving into a checked item starts it again with the moved amount',
);

// Amounts that scale to nothing, or can't be held
const pinchOfSalt = shopRecipe('pinch', 4, [
  ['salt', 0.01, 'TSP'],
  ['rice', 1, 'CUP'],
]);
assert.deepEqual(
  getRecipeLines(pinchOfSalt, shopIngredients, 1),
  [{ ingredientId: 'rice', amount: 0.25, unit: 'CUP' }],
  'an amount that rounds to zero after scaling is left out, and the rest stays',
);
assert.deepEqual(
  getRecipeLines(
    shopRecipe('only-a-pinch', 4, [['salt', 0.01, 'TSP']]),
    shopIngredients,
    1,
  ),
  [],
  'a recipe whose every line rounds to zero gives no lines to add',
);
assert.equal(
  isValidAmount(roundAmount(0.004)),
  false,
  'a typed amount that rounds to zero is refused',
);
assert.equal(isValidAmount(roundAmount(0.006)), true, 'two decimals are kept');
assert.deepEqual(
  [0, -1, NaN, Infinity, 1_000_000.01].map(isValidAmount),
  [false, false, false, false, false],
  'zero, negative, not-a-number, infinite and over-cap amounts are refused',
);
assert.equal(isValidAmount(1_000_000), true, 'the cap itself is allowed');
const noServings = shopRecipe('no-servings', 0, [['rice', 1, 'CUP']]);
assert.deepEqual(
  [
    getRecipeLines(noServings, shopIngredients),
    getRecipeLines(noServings, shopIngredients, 2),
  ],
  [[], []],
  'a recipe with no servings gives no lines, never an endless amount',
);
assert.deepEqual(
  getItemsLines(
    [mealItem('z', 'RECIPE', 'no-servings', 2)],
    new Map([[noServings.id, noServings]]),
    shopIngredients,
  ),
  [],
  'a meal item over a recipe with no servings gives no lines',
);
assert.equal(
  toWebLink('  https://www.Example.com/a/  '),
  'https://www.example.com/a/',
  'stray spaces around a link are dropped and its host is lower-cased',
);
assert.equal(
  toWebLink('Lemon bars\nhttps://site.example.com/lemon-bars'),
  'https://site.example.com/lemon-bars',
  'a title and a link that share the pasted text give the link',
);
assert.equal(
  toWebLink('Lemon bars\thttps://site.example.com/x\tlook at this'),
  'https://site.example.com/x',
  'tabs separate words as spaces do',
);
assert.equal(
  toWebLink('HTTPS://Site.example.com/x \r\n my notes'),
  'https://site.example.com/x',
  'a link with a capital scheme is found among words and line breaks',
);
assert.equal(
  toWebLink('https://one.example.com/a https://two.example.com/b'),
  null,
  'two links in one paste are not one link',
);
assert.equal(
  toWebLink('https://one.example.com/a\nhttp://two.example.com/b'),
  null,
  'two links on two lines are not one link',
);
assert.equal(
  hasSeveralWebLinks('one https://a.example.com/x and http://b.example.com/y'),
  true,
  'two links are counted',
);
assert.equal(
  hasSeveralWebLinks('Lemon bars\nhttps://a.example.com/x'),
  false,
  'one link among words is one link',
);
assert.equal(
  toWebLink('example.com/recipes/very\nlong/path-that-wrapped'),
  'https://example.com/recipes/verylong/path-that-wrapped',
  'a link with no scheme that wrapped over lines is joined',
);
assert.equal(
  toWebLink('https://example.com/a?next=https://other.example.com/b'),
  'https://example.com/a?next=https://other.example.com/b',
  'a link that holds another address in its query is still one link',
);
assert.equal(
  toWebLink('seriouseats.com/recipes/x'),
  'https://seriouseats.com/recipes/x',
  'a link with no scheme is read as https',
);
assert.equal(
  toWebLink('http://example.com'),
  'http://example.com/',
  'http stays http',
);
[
  'javascript:alert(1)',
  'ftp://files.example.com/x',
  'mailto:a@example.com',
  'data:text/html,hi',
  'https://user:secret@example.com/x',
  'not a link',
  'localhost:3000',
  '',
  '   ',
].forEach((text) =>
  assert.equal(
    toWebLink(text),
    null,
    `${JSON.stringify(text)} is not a web link`,
  ),
);
assert.equal(
  getWebLinkHost('https://www.seriouseats.com/x'),
  'seriouseats.com',
  'the host drops www',
);

const comparable = (text: string) => getComparableUrl(text);
const samePage = [
  'https://www.example.com/recipes/lemon-bars',
  'http://example.com/recipes/lemon-bars/',
  'EXAMPLE.com/recipes/lemon-bars?utm_source=news&utm_medium=email#comments',
  'https://example.com/recipes/lemon-bars?fbclid=abc&gclid=def',
  ' https://example.com/recipes/lemon-bars/?igshid=1 ',
  'https://example.com/recipes/lemon-bars?igsh=abc&si=def&mibextid=ghi',
];
samePage.forEach((text) =>
  assert.equal(
    comparable(text),
    'example.com/recipes/lemon-bars',
    `${text} is the same page`,
  ),
);
assert.notEqual(
  comparable('https://example.com/recipes/lemon-bars'),
  comparable('https://example.com/recipes/lemon-cake'),
  'another path is another page',
);
assert.notEqual(
  comparable('https://example.com/watch?v=1'),
  comparable('https://example.com/watch?v=2'),
  'a parameter that picks the page keeps it apart',
);
assert.equal(
  comparable('https://example.com/p?b=2&a=1'),
  comparable('https://example.com/p?a=1&b=2'),
  'parameter order does not matter',
);
assert.equal(
  comparable('https://example.com'),
  'example.com',
  'a bare site has no trailing slash',
);
assert.equal(comparable('hello'), null, 'text is not a page');

const idea = (fields: Partial<Idea>): Idea => ({
  id: 'idea',
  kind: 'TEXT',
  title: 'Lemon bars',
  note: null,
  url: null,
  siteName: null,
  imageUrl: null,
  photoPath: null,
  recipeId: null,
  createdAt: 1,
  updatedAt: 1,
  ...fields,
});
const saved = [
  idea({ id: 'a', kind: 'LINK', url: 'https://www.example.com/lemon-bars/' }),
  idea({ id: 'b', kind: 'TEXT' }),
];
assert.equal(
  findIdeaByUrl(saved, 'http://example.com/lemon-bars?utm_source=x')?.id,
  'a',
  'a link already saved is found by its page',
);
assert.equal(
  findIdeaByUrl(saved, 'https://example.com/lemon-bars', 'a'),
  null,
  'the idea being edited is not its own duplicate',
);
assert.equal(
  findIdeaByUrl(saved, 'https://example.com/other'),
  null,
  'a new page is not a duplicate',
);
assert.equal(findIdeaByUrl(saved, 'nonsense'), null, 'text matches nothing');

assert.equal(
  toIdeaUrl(`https://example.com/${'a'.repeat(2000)}`),
  null,
  'a link over 2,000 characters is not kept',
);
assert.equal(
  toIdeaImageUrl('https://images.example.com/a.jpg'),
  'https://images.example.com/a.jpg',
  'an https picture is kept',
);
assert.equal(
  toIdeaImageUrl('http://images.example.com/a.jpg'),
  null,
  'an http picture is not kept',
);
assert.equal(
  toIdeaImageUrl('javascript:alert(1)'),
  null,
  'a script address is not kept',
);
assert.equal(toIdeaImageUrl(null), null, 'no picture is none');

assert.equal(
  getIdeaDetail(
    idea({
      kind: 'LINK',
      siteName: 'Serious Eats',
      url: 'https://www.example.com/x',
      note: 'Chill overnight',
    }),
  ),
  'Serious Eats',
  'a link row says its site, not its note',
);
assert.equal(
  getIdeaDetail(idea({ kind: 'LINK', url: 'https://www.example.com/x' })),
  'example.com',
  'a link with no site name says its host',
);
assert.equal(
  getIdeaDetail(idea({ note: '\n  First line  \nSecond line' })),
  'First line',
  'a jotted idea says the first line of its note',
);
assert.equal(getIdeaDetail(idea({})), null, 'nothing to say gives no line');
assert.equal(
  getIdeaDetail(
    idea({
      kind: 'LINK',
      title: 'seriouseats.com',
      url: 'https://www.seriouseats.com/x',
    }),
  ),
  null,
  'a link saved with its host as the title does not say the host twice',
);
assert.equal(
  getIdeaDetail(
    idea({
      kind: 'LINK',
      title: ' SeriousEats.com ',
      siteName: 'seriouseats.com',
      url: 'https://www.seriouseats.com/x',
    }),
  ),
  null,
  'the comparison ignores case and spaces',
);
assert.equal(
  getIdeaDetail(
    idea({
      kind: 'LINK',
      title: 'seriouseats.com',
      note: 'Sunday project',
      url: 'https://www.seriouseats.com/x',
    }),
  ),
  'Sunday project',
  'a repeated site gives way to the first line of the note',
);
assert.equal(
  getIdeaDetail(idea({ title: 'Sunday project', note: 'sunday project' })),
  null,
  'a note that is only the title says nothing more',
);
assert.equal(
  getIdeaSearchText(
    idea({ kind: 'LINK', siteName: 'NYT Cooking', note: 'overnight' }),
  ),
  'Lemon bars NYT Cooking overnight',
  'search covers the title, site and note',
);
assert.deepEqual(
  getMissingIdeaFields({ id: 'x', title: 't', note: null }),
  {
    url: null,
    siteName: null,
    imageUrl: null,
    photoPath: null,
    recipeId: null,
  },
  'an older idea gets the keys it lacks, as null',
);
assert.deepEqual(
  getMissingIdeaFields(idea({})),
  {},
  'a whole idea lacks nothing',
);

const cookOf = (
  id: string,
  recipeId: string,
  cookedAt: number,
  createdAt = 1,
) =>
  ({
    id,
    recipeId,
    plannedMealId: null,
    servings: 4,
    cookedAt,
    createdAt,
    updatedAt: createdAt,
  }) as Cook;

assert.equal(
  getCookId('planned-1', 'recipe-9'),
  'planned-1__recipe-9',
  'a planned meal and a recipe give one deterministic cook id',
);
assert.notEqual(
  getCookId('planned-1', 'recipe-9'),
  getCookId('recipe-9', 'planned-1'),
  'the id is not symmetric',
);
assert.equal(
  getPlannedCookId(null, 'recipe-9'),
  null,
  'cooking started from a recipe has no planned cook: Finish writes a fresh one',
);
assert.equal(
  getPlannedCookId('planned-1', 'recipe-9'),
  getCookId('planned-1', 'recipe-9'),
  "cooking started from a planned meal marks that meal's own cook, the one its row looks up",
);
assert.notEqual(
  getPlannedCookId('planned-1', 'recipe-9'),
  getPlannedCookId('planned-2', 'recipe-9'),
  'the same recipe on two meals is two cooks',
);
assert.notEqual(
  getPlannedCookId('planned-1', 'recipe-9'),
  getPlannedCookId('planned-1', 'recipe-8'),
  'two recipes of one meal are two cooks',
);

const cookList = [
  cookOf('a', 'adobo', 100),
  cookOf('b', 'rice', 300),
  cookOf('c', 'adobo', 500),
  cookOf('d', 'adobo', 500, 9),
  cookOf('e', 'adobo', 200),
];
assert.deepEqual(
  groupCooksByRecipe(cookList)
    .get('adobo')
    ?.map((cook) => cook.id),
  ['d', 'c', 'e', 'a'],
  'a recipe lists its cooks newest first, a tie by creation',
);
assert.deepEqual(
  [...groupCooksByRecipe(cookList).keys()].sort(),
  ['adobo', 'rice'],
  'one group per recipe that has a cook',
);
assert.equal(groupCooksByRecipe([]).size, 0, 'no cooks gives no groups');
assert.deepEqual(
  [...getCookSummaries(cookList).entries()].sort(([x], [y]) =>
    x.localeCompare(y),
  ),
  [
    ['adobo', { count: 4, lastCookedAt: 500 }],
    ['rice', { count: 1, lastCookedAt: 300 }],
  ],
  'the summary counts each recipe and keeps its latest cook, in one pass',
);
assert.equal(
  getCookSummaries(cookList).get('nachos'),
  undefined,
  'a recipe with no cook has no summary',
);
assert.equal(
  getCookSummaries([cookOf('n', 'adobo', -1_000_000_000_000)]).get('adobo')
    ?.lastCookedAt,
  -1_000_000_000_000,
  'a cook before 1970 keeps its own time as the last one',
);
assert.equal(
  getCookSummaries([cookOf('x', 'adobo', 700), cookOf('y', 'adobo', 100)]).get(
    'adobo',
  )?.lastCookedAt,
  700,
  'the last cook is the latest time, whatever the order they arrive in',
);
assert.equal(isCookHistoryFull(499), false, '499 cooks still fits');
assert.equal(isCookHistoryFull(500), true, '500 cooks is full');
assert.deepEqual(
  [0, -1, 0.5, 1, 1000, 1000.5, 1001, Number.NaN, Number.POSITIVE_INFINITY].map(
    isValidCookServings,
  ),
  [false, false, true, true, true, false, false, false, false],
  'servings above zero and up to 1,000',
);
assert.deepEqual(
  [4, 0, -3, 1_000_000, Number.NaN, 0.5].map(getCookServings),
  [4, 1, 1, 1000, 1, 0.5],
  "a recipe's servings are kept inside what a cook holds",
);

const localNoon = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 12).getTime();
const planNow = new Date(2026, 9, 14, 8, 30).getTime();
assert.equal(
  getPlannedCookedAt(Date.UTC(2026, 9, 14), planNow),
  planNow,
  'a meal planned for today is cooked now',
);
const pastCookedAt = getPlannedCookedAt(Date.UTC(2026, 9, 12), planNow);
assert.equal(
  pastCookedAt,
  localNoon(2026, 9, 12),
  'a meal on a day that has passed is cooked at local noon of that day',
);
assert.equal(
  toLocalDateInputValue(pastCookedAt),
  '2026-10-12',
  "that noon falls on the planned day in the viewer's own time zone",
);
assert.equal(
  getPlannedCookedAt(Date.UTC(2026, 9, 15), planNow),
  null,
  'a day still ahead has nothing to mark',
);
assert.equal(
  getPlannedCookedAt(
    Date.UTC(2026, 9, 14),
    new Date(2026, 9, 14, 23, 59).getTime(),
  ),
  new Date(2026, 9, 14, 23, 59).getTime(),
  'today is still today at 23:59 local',
);

const recipeOf = (id: string) => ({ id, title: id }) as Recipe;
const knownRecipes = new Map([
  ['adobo', recipeOf('adobo')],
  ['rice', recipeOf('rice')],
]);
assert.deepEqual(
  getMarkableRecipes(
    [
      { id: '1', kind: 'RECIPE', refId: 'adobo', servings: 2 },
      { id: '2', kind: 'INGREDIENT', refId: 'adobo', servings: 1 },
      { id: '3', kind: 'RECIPE', refId: 'rice', servings: 1.5 },
      { id: '4', kind: 'RECIPE', refId: 'adobo', servings: 3 },
      { id: '5', kind: 'RECIPE', refId: 'gone', servings: 1 },
    ],
    knownRecipes,
  ).map(({ recipe, servings }) => [recipe.id, servings]),
  [
    ['adobo', 5],
    ['rice', 1.5],
  ],
  'one row per recipe, in first-seen order, servings added up, ingredients and unknown recipes left out',
);
assert.equal(
  getMarkableRecipes(
    [
      { id: '1', kind: 'RECIPE', refId: 'adobo', servings: 900 },
      { id: '2', kind: 'RECIPE', refId: 'adobo', servings: 900 },
    ],
    knownRecipes,
  )[0].servings,
  1000,
  'added-up servings stay within what a cook holds',
);
assert.deepEqual(
  getMarkableRecipes(
    [
      { id: '1', kind: 'RECIPE', refId: 'adobo', servings: 2 },
      { id: '2', kind: 'RECIPE', refId: 'adobo', servings: 2 },
    ],
    knownRecipes,
  ).map(({ recipe }) => getCookId('plan-1', recipe.id)),
  [getPlannedCookId('plan-1', 'adobo')],
  "a recipe twice in one meal has one row and one cook, and cooking either copy finishes into that row's cook",
);

const firstCook = cookOf('plan-1__adobo', 'adobo', 1000, 5);
const secondTry = { ...firstCook, servings: 9, cookedAt: 9999, createdAt: 8 };
assert.deepEqual(
  mergePlannedCook(null, firstCook),
  { isNew: true, cook: firstCook },
  'the first mark of a planned meal creates the cook',
);
assert.deepEqual(
  mergePlannedCook(firstCook, secondTry),
  { isNew: false, cook: firstCook },
  'marking it again changes nothing: the first cook stays as it was',
);
assert.deepEqual(
  getMissingCookFields({ id: 'x', recipeId: 'adobo' }),
  { plannedMealId: null },
  'an older cook gets the key it lacks, as null',
);
assert.deepEqual(
  getMissingCookFields({ plannedMealId: null }),
  {},
  'a cook with the key, even a null one, lacks nothing',
);

const repriceIngredient = (id: string) =>
  ({
    id,
    name: id,
    familyId: null,
    aliases: [],
    per100g: { calories: 200, protein: 20, carbs: 10, fat: 5 },
    serving: { amount: 100, unit: 'G' },
    gramsPerMl: null,
    gramsEach: null,
    isCustom: false,
    isAdjusted: false,
    isArchived: false,
  }) as ResolvedIngredient;

const repriceContext = (
  recipes: Recipe[],
  ingredients: ResolvedIngredient[],
  products: Product[],
): CostContext => {
  const ingredientsById = new Map(
    ingredients.map((entry) => [entry.id, entry]),
  );
  const defaultProducts = new Map(
    products.map((entry) => [entry.ingredientId, entry]),
  );
  return {
    recipeCosts: new Map(
      recipes.map((entry) => [
        entry.id,
        getRecipeCost(entry, ingredientsById, defaultProducts),
      ]),
    ),
    ingredientsById,
    defaultProducts,
    recipeNutrition: new Map(
      recipes.map((entry) => [
        entry.id,
        getRecipeNutrition(entry, ingredientsById),
      ]),
    ),
  };
};

const adoboRecipe = {
  ...recipe(4, [
    ['thigh', 2, 'LB'],
    ['soy', 1, 'CUP'],
  ]),
  id: 'adobo',
} as Recipe;
const repriceIngredients = ['thigh', 'soy', 'feet'].map(repriceIngredient);
const adoboItem: MealItem = {
  id: 'a',
  kind: 'RECIPE',
  refId: 'adobo',
  servings: 2,
};
const feetItem: MealItem = {
  id: 'b',
  kind: 'INGREDIENT',
  refId: 'feet',
  servings: 1,
};
const plannedOf = (
  items: MealItem[],
  snapshot: PlannedSnapshot | null,
): PlannedMeal =>
  ({
    id: 'planned',
    date: 0,
    mealType: 'DINNER',
    name: null,
    sourceMealId: null,
    items,
    refIds: items.map((entry) => entry.refId),
    snapshot,
    createdAt: 1,
    updatedAt: 1,
  }) as PlannedMeal;

const thenContext = repriceContext([adoboRecipe], repriceIngredients, []);
const fixedThen = buildSnapshot([adoboItem, feetItem], thenContext, 1000);
assert.equal(fixedThen.repricedAt, null, 'a freeze writes a null repricedAt');
assert.equal(fixedThen.costCents, null, 'nothing was priced when it froze');
const fixedMeal = plannedOf([adoboItem, feetItem], fixedThen);
assert.equal(
  wouldRepriceChange(fixedMeal, thenContext),
  false,
  'same prices, nothing to change',
);
assert.equal(
  wouldRepriceChange(plannedOf([adoboItem], null), thenContext),
  false,
  'a day that is not fixed has nothing to re-price',
);

const nowProducts = [
  product('thigh', 600, 3, 'LB'),
  product('feet', 599, 2, 'LB'),
];
const nowContext = repriceContext(
  [adoboRecipe],
  repriceIngredients,
  nowProducts,
);
assert.equal(
  wouldRepriceChange(fixedMeal, nowContext),
  true,
  'a price added since fills in a line that had none',
);
const repriced = buildRepricedSnapshot(
  fixedThen,
  fixedMeal.items,
  nowContext,
  5000,
);
assert.deepEqual(
  repriced,
  { ...buildSnapshot(fixedMeal.items, nowContext, 1000), repricedAt: 5000 },
  "a re-priced snapshot is what the freeze would write from today's data, plus when, with the day's first fixing time kept",
);
assert.equal(repriced.frozenAt, 1000);
assert.equal(getRepricedAt(repriced), 5000);
assert.notEqual(repriced.costCents, null);
assert.deepEqual(
  repriced.lines.map((entry) => entry.itemId),
  ['a', 'b'],
  'every item keeps a line, in the same order',
);
assert.equal(
  wouldRepriceChange(plannedOf(fixedMeal.items, repriced), nowContext),
  false,
  'pricing again with nothing new changes nothing, so the offer goes away',
);
assert.equal(
  wouldRepriceChange(plannedOf(fixedMeal.items, repriced), thenContext),
  true,
  'a price taken away would change it back',
);

const onlyFeet = repriceContext([adoboRecipe], repriceIngredients, [
  product('feet', 599, 2, 'LB'),
]);
const partlyPriced = buildRepricedSnapshot(
  fixedThen,
  fixedMeal.items,
  onlyFeet,
  5000,
);
assert.equal(
  partlyPriced.lines.find((entry) => entry.itemId === 'a')?.costCents,
  null,
  'a line whose product is still missing stays unpriced',
);
assert.notEqual(
  partlyPriced.lines.find((entry) => entry.itemId === 'b')?.costCents,
  null,
  'and the one that now has a product is priced',
);
assert.equal(
  partlyPriced.leftOut.every((entry) => entry.ingredientId !== 'feet'),
  true,
  'what is still left out no longer names the priced ingredient',
);

const noneAtAll = buildRepricedSnapshot(
  fixedThen,
  fixedMeal.items,
  thenContext,
  5000,
);
assert.equal(noneAtAll.costCents, null);
assert.deepEqual(
  noneAtAll.lines.map((entry) => entry.costCents),
  [null, null],
  'a day with nothing priced stays unpriced',
);

const withoutKey = {
  ...fixedThen,
  repricedAt: undefined,
} as unknown as PlannedSnapshot;
assert.equal(
  getRepricedAt(withoutKey),
  null,
  'a snapshot written before the key existed reads as not re-priced',
);
assert.equal(
  wouldRepriceChange(plannedOf(fixedMeal.items, withoutKey), nowContext),
  true,
  'and can be re-priced like any other',
);

const subCent = repriceContext([adoboRecipe], repriceIngredients, [
  product('thigh', 600, 3, 'LB'),
  product('soy', 300, 1, 'L'),
  product('feet', 599, 2, 'LB'),
]);
const settled = buildSnapshot(fixedMeal.items, subCent, 1000);
const nudged = {
  ...settled,
  costCents: Math.round(settled.costCents ?? 0) + 0.2,
  lines: settled.lines.map((entry) => ({
    ...entry,
    costCents: Math.round(entry.costCents ?? 0) + 0.2,
  })),
};
assert.equal(
  wouldRepriceChange(plannedOf(fixedMeal.items, nudged), subCent),
  false,
  'a stored cost off by a fraction of a cent shows the same amount, so it is not offered',
);

const withGoneIngredient = [
  adoboItem,
  { id: 'c', kind: 'INGREDIENT', refId: 'removed', servings: 1 } as MealItem,
];
const goneThen = buildSnapshot(withGoneIngredient, nowContext, 1000);
assert.doesNotThrow(() =>
  buildRepricedSnapshot(goneThen, withGoneIngredient, nowContext, 5000),
);
const goneNow = buildRepricedSnapshot(
  goneThen,
  withGoneIngredient,
  nowContext,
  5000,
);
assert.deepEqual(
  goneNow.lines.map((entry) => entry.itemId),
  ['a', 'c'],
  'a meal naming an ingredient that is gone keeps a line for it',
);
assert.equal(goneNow.lines[1].costCents, null);
assert.equal(
  goneNow.leftOut.some((entry) => entry.ingredientId === 'removed'),
  true,
  'and names it as left out',
);

assert.equal(
  getFixedNote([fixedThen]),
  'Fixed when the day passed',
  'a day nobody re-priced says it was fixed when it passed',
);
assert.equal(
  getFixedNote([withoutKey]),
  'Fixed when the day passed',
  'and so does one written before the key existed',
);
assert.match(
  getFixedNote([repriced, { ...repriced, repricedAt: 4000 }]),
  /^Priced with today's prices on /,
  'a day with every meal re-priced says so',
);
assert.match(
  getFixedNote([repriced, fixedThen]),
  /^Some meals priced with today's prices on /,
  'a day with only some of its meals re-priced says some',
);

const previewNow = getRepricePreview([fixedMeal], nowContext);
assert.equal(
  previewNow.beforeCents,
  null,
  'a day nothing was priced on reads null before',
);
assert.equal(
  previewNow.afterCents,
  repriced.costCents,
  'the preview is the cost the re-price writes, from the same function',
);
assert.equal(
  previewNow.leftOutCount,
  new Set(repriced.leftOut.map((gap) => gap.ingredientId)).size,
  'and counts the ingredients it still cannot price, once each',
);
const previewNothing = getRepricePreview([fixedMeal], thenContext);
assert.deepEqual(
  [previewNothing.beforeCents, previewNothing.afterCents],
  [null, null],
  'a day with nothing priced then or now previews no total',
);
assert.equal(
  previewNothing.leftOutCount,
  3,
  'and names its three unpriced ingredients',
);
assert.deepEqual(
  getRepricePreview([plannedOf([adoboItem], null)], nowContext),
  { beforeCents: null, afterCents: null, leftOutCount: 0 },
  'a meal that is not fixed is left out of the preview',
);
const secondMeal = plannedOf(
  [feetItem],
  buildSnapshot([feetItem], thenContext, 1000),
);
const previewTwo = getRepricePreview([fixedMeal, secondMeal], nowContext);
assert.equal(
  previewTwo.afterCents,
  (buildSnapshot(fixedMeal.items, nowContext, 1).costCents ?? 0) +
    (buildSnapshot([feetItem], nowContext, 1).costCents ?? 0),
  'several meals add up, each from its own items',
);
const longerAdobo = {
  ...adoboRecipe,
  ingredients: adoboRecipe.ingredients.map((line) => ({
    ...line,
    amount: line.amount * 2,
  })),
} as Recipe;
const pricedFixed = buildSnapshot(fixedMeal.items, nowContext, 1000);
const tweakedContext = repriceContext(
  [longerAdobo],
  repriceIngredients,
  nowProducts,
);
const tweakedMeal = plannedOf(fixedMeal.items, pricedFixed);
assert.equal(
  wouldRepriceChange(tweakedMeal, tweakedContext),
  true,
  'a recipe changed since the day passed makes the row appear with no price changed',
);
const previewTweaked = getRepricePreview([tweakedMeal], tweakedContext);
assert.equal(
  (previewTweaked.afterCents ?? 0) > (previewTweaked.beforeCents ?? 0),
  true,
  'and the preview shows the new total against the old one',
);

assert.deepEqual(
  getRepriceLines({ beforeCents: null, afterCents: 66.0285, leftOutCount: 0 }),
  { before: 'Not priced', after: 'about $0.66', leftOut: null },
  'an unpriced day says Not priced as its tile does, the result says about, nothing unpriced adds no line',
);
assert.equal(
  getRepriceLines({ beforeCents: null, afterCents: null, leftOutCount: 1 })
    .before,
  'Not priced',
  'a day already priced again reads Not priced too, like its tile',
);
assert.deepEqual(
  getRepriceLines({ beforeCents: 1066.4, afterCents: null, leftOutCount: 2 }),
  {
    before: '$10.66',
    after: 'Still no price',
    leftOut: '2 ingredients still have no price',
  },
  'a priced day shows its total as the tile does, a result with no price says so, and the count is plural',
);
assert.equal(
  getRepriceLines({ beforeCents: 0, afterCents: 99.6, leftOutCount: 1 })
    .leftOut,
  '1 ingredient still has no price',
  'one ingredient is singular',
);
assert.equal(
  getRepriceLines({ beforeCents: 0, afterCents: 99.6, leftOutCount: 1 }).before,
  '$0.00',
);

const names = new Map([
  ['garlic', { name: 'Garlic' }],
  ['lime', { name: 'Lime juice' }],
  ['salt', { name: 'Salt' }],
  ['butter', { name: 'Butter' }],
  ['oil', { name: 'Olive oil' }],
]);
const sourceNames = new Map([
  ['s1', { label: 'Serious Eats' }],
  ['s2', { label: "Mom's recipe cards" }],
]);
const recipeLine = (
  id: string,
  ingredientId: string,
  amount: number,
  unit: Unit,
  note: string | null = null,
) => ({ id, ingredientId, amount, unit, note });
const baseRecipe: RecipeContent = {
  title: 'Adobo chicken',
  description: 'Sticky and tangy.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 35,
  ingredients: [
    recipeLine('l1', 'garlic', 4, 'EACH'),
    recipeLine('l2', 'salt', 1, 'TSP'),
    recipeLine('l3', 'butter', 2, 'TBSP', 'cold'),
  ],
  steps: ['Marinate.', 'Simmer for 25 minutes.', 'Reduce the sauce.'],
  nutritionOverride: null,
  sourceId: null,
};
const changesFor = (patch: Partial<RecipeContent>) =>
  getRecipeChanges(baseRecipe, { ...baseRecipe, ...patch }, names, sourceNames);

assert.deepEqual(
  changesFor({}),
  [],
  'an edit that changes nothing has no lines',
);
assert.deepEqual(
  getRecipeChanges(
    baseRecipe,
    {
      ...baseRecipe,
      title: '  Adobo chicken ',
      description: ' Sticky and tangy.\n',
      steps: [
        ' Marinate.',
        'Simmer for 25 minutes.  ',
        'Reduce the sauce.',
        '  ',
      ],
      ingredients: baseRecipe.ingredients.map((line) => ({
        ...line,
        note: line.note === null ? '  ' : line.note,
      })),
    },
    names,
  ),
  [],
  'stray spaces, an empty step and a blank note are not changes',
);
assert.deepEqual(
  getRecipeChanges(
    { ...baseRecipe, description: null, sourceId: null },
    { ...baseRecipe, description: '', sourceId: null },
    names,
  ),
  [],
  'an empty description is the same as none',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      recipeLine('l1', 'garlic', 6, 'EACH'),
      baseRecipe.ingredients[1],
      baseRecipe.ingredients[2],
    ],
  }),
  ['Garlic 4 → 6 each'],
  'an amount change names the ingredient, both amounts and the unit once',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      recipeLine('l1', 'garlic', 0.5, 'CUP'),
      baseRecipe.ingredients[1],
      baseRecipe.ingredients[2],
    ],
  }),
  ['Garlic 4 each → 0.5 cup'],
  'a unit change shows both units',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      recipeLine('l1', 'garlic', 1.005, 'EACH'),
      baseRecipe.ingredients[1],
      baseRecipe.ingredients[2],
    ],
  }),
  ['Garlic 4 → 1 each'],
  'amounts show at most two decimals',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      ...baseRecipe.ingredients,
      recipeLine('l4', 'lime', 2, 'TBSP'),
    ],
  }),
  ['Added Lime juice, 2 tbsp'],
  'a new line is added with its amount',
);
assert.deepEqual(
  changesFor({
    ingredients: baseRecipe.ingredients.filter((l) => l.id !== 'l2'),
  }),
  ['Removed Salt'],
  'a line taken out is removed by name',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      baseRecipe.ingredients[0],
      baseRecipe.ingredients[1],
      recipeLine('l3', 'oil', 2, 'TBSP', 'cold'),
    ],
  }),
  ['Swapped Butter for Olive oil'],
  'another ingredient on the same line is a swap, and the amount is only repeated when it changed',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      baseRecipe.ingredients[0],
      baseRecipe.ingredients[1],
      recipeLine('l3', 'oil', 3, 'TBSP', 'cold'),
    ],
  }),
  ['Swapped Butter for Olive oil, 3 tbsp'],
  'a swap that also changes the amount says the new amount',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      baseRecipe.ingredients[0],
      recipeLine('l2', 'salt', 1, 'TSP', 'flaky'),
      recipeLine('l3', 'butter', 2, 'TBSP', 'softened'),
    ],
  }),
  ['Added a note to Salt', 'Note on Butter changed'],
  'a line note added or edited is said',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      baseRecipe.ingredients[0],
      baseRecipe.ingredients[1],
      recipeLine('l3', 'butter', 2, 'TBSP', null),
    ],
  }),
  ['Removed the note from Butter'],
  'a line note taken off is said',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      baseRecipe.ingredients[2],
      baseRecipe.ingredients[0],
      baseRecipe.ingredients[1],
    ],
  }),
  ['Ingredients reordered'],
  'the same lines in another order are reordered, and nothing else',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      baseRecipe.ingredients[1],
      recipeLine('l1', 'garlic', 5, 'EACH'),
      baseRecipe.ingredients[2],
    ],
  }),
  ['Garlic 4 → 5 each', 'Ingredients reordered'],
  'a change and a move are both said',
);
assert.deepEqual(
  changesFor({
    steps: ['Marinate.', 'Simmer for 35 minutes.', 'Reduce the sauce.'],
  }),
  ['Step 2 now reads: “Simmer for 35 minutes.”'],
  'an edited step says its number and the new text',
);
const longStep = `Simmer ${'gently and slowly '.repeat(20)}until done.`;
const longChange = changesFor({
  steps: ['Marinate.', longStep, 'Reduce the sauce.'],
})[0];
assert.ok(
  longChange.endsWith('…”') && longChange.length < 130,
  'a long step is quoted in part, with an ellipsis',
);
assert.deepEqual(
  changesFor({
    steps: [
      'Marinate.',
      'Rest it.',
      'Simmer for 25 minutes.',
      'Reduce the sauce.',
    ],
  }),
  ['Added step 2: “Rest it.”'],
  'a step put in the middle is one added step, not a rewrite of what follows',
);
assert.deepEqual(
  changesFor({ steps: [...baseRecipe.steps, 'Serve.'] }),
  ['Added step 4: “Serve.”'],
  'a step added at the end',
);
assert.deepEqual(
  changesFor({ steps: ['Marinate.', 'Reduce the sauce.'] }),
  ['Removed step 2: “Simmer for 25 minutes.”'],
  'a step taken out is removed with its old number and text',
);
assert.deepEqual(
  changesFor({
    steps: ['Simmer for 25 minutes.', 'Marinate.', 'Reduce the sauce.'],
  }),
  ['Steps reordered'],
  'the same steps in another order are reordered',
);
assert.deepEqual(
  changesFor({
    steps: ['Marinate hard.', 'Simmer for 25 minutes.', 'Reduce it.'],
  }),
  ['Step 1 now reads: “Marinate hard.”', 'Step 3 now reads: “Reduce it.”'],
  'two separate edits are two lines',
);
assert.deepEqual(
  changesFor({ steps: [] }),
  [
    'Removed step 1: “Marinate.”',
    'Removed step 2: “Simmer for 25 minutes.”',
    'Removed step 3: “Reduce the sauce.”',
  ],
  'every step taken out',
);
assert.deepEqual(changesFor({ cookMinutes: 45 }), ['Cook time 35 → 45 min']);
assert.deepEqual(changesFor({ prepMinutes: 5 }), ['Prep time 10 → 5 min']);
assert.deepEqual(
  changesFor({ cookMinutes: 70 }),
  ['Cook time 35 min → 1 h 10 min'],
  'a time past an hour is written out in hours on both sides',
);
assert.deepEqual(changesFor({ prepMinutes: null }), ['Prep time removed']);
assert.deepEqual(
  getRecipeChanges({ ...baseRecipe, cookMinutes: null }, baseRecipe, names),
  ['Cook time set to 35 min'],
);
assert.deepEqual(changesFor({ servings: 6 }), ['Serves 4 → 6']);
assert.deepEqual(changesFor({ servings: 2.5 }), ['Serves 4 → 2.5']);
assert.deepEqual(
  changesFor({ description: 'Sticky, tangy and a little sweet.' }),
  ['Description changed'],
);
assert.deepEqual(changesFor({ description: null }), [
  'Removed the description',
]);
assert.deepEqual(
  getRecipeChanges({ ...baseRecipe, description: null }, baseRecipe, names),
  ['Added a description'],
);
assert.deepEqual(changesFor({ title: 'Better adobo' }), [
  'Renamed to “Better adobo”',
]);
assert.deepEqual(
  changesFor({
    nutritionOverride: { calories: 520, protein: null, carbs: null, fat: 20 },
  }),
  ['Calories set to 520', 'Fat set to 20 g'],
  'a typed-over number is set, and macros carry their unit',
);
assert.deepEqual(
  getRecipeChanges(
    {
      ...baseRecipe,
      nutritionOverride: { calories: 520, protein: 30, carbs: null, fat: null },
    },
    {
      ...baseRecipe,
      nutritionOverride: {
        calories: 600,
        protein: null,
        carbs: null,
        fat: null,
      },
    },
    names,
  ),
  ['Calories 520 → 600', 'Protein back to the calculated number'],
  'a typed number changed, and one handed back to the calculation',
);
assert.deepEqual(
  getRecipeChanges(
    {
      ...baseRecipe,
      nutritionOverride: {
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
      },
    },
    baseRecipe,
    names,
  ),
  [],
  'an override with nothing typed is the same as none',
);
assert.deepEqual(changesFor({ sourceId: 's1' }), [
  'Source set to Serious Eats',
]);
assert.deepEqual(
  getRecipeChanges(
    { ...baseRecipe, sourceId: 's1' },
    { ...baseRecipe, sourceId: 's2' },
    names,
    sourceNames,
  ),
  ["Source changed to Mom's recipe cards"],
);
assert.deepEqual(
  getRecipeChanges(
    { ...baseRecipe, sourceId: 's1' },
    baseRecipe,
    names,
    sourceNames,
  ),
  ['Source removed'],
);
assert.deepEqual(
  getRecipeChanges(baseRecipe, { ...baseRecipe, sourceId: 'gone' }, names),
  ['Source set to another source'],
  'a source nobody knows by name is still said',
);
assert.deepEqual(
  changesFor({
    title: 'Better adobo',
    servings: 6,
    cookMinutes: 45,
    ingredients: [
      recipeLine('l1', 'garlic', 6, 'EACH'),
      ...baseRecipe.ingredients.slice(1),
    ],
  }),
  [
    'Renamed to “Better adobo”',
    'Serves 4 → 6',
    'Cook time 35 → 45 min',
    'Garlic 4 → 6 each',
  ],
  'lines come in the order the recipe form shows things',
);

const manyLines = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    recipeLine(`m${index}`, 'salt', index + 2, 'TSP'),
  );
const manyBase = { ...baseRecipe, ingredients: manyLines(12) };
const manyAfter = (changed: number) => ({
  ...baseRecipe,
  ingredients: manyLines(12).map((line, index) =>
    index < changed ? { ...line, amount: line.amount + 1 } : line,
  ),
});
assert.equal(
  getRecipeChanges(manyBase, manyAfter(8), names).length,
  8,
  'eight changes are all kept',
);
assert.equal(
  getRecipeChanges(manyBase, manyAfter(8), names).some((line) =>
    line.startsWith('and '),
  ),
  false,
  'and none is folded into "and N more"',
);
const nineChanges = getRecipeChanges(manyBase, manyAfter(9), names);
assert.equal(nineChanges.length, 8, 'nine changes fit the rules’ eight');
assert.deepEqual(
  nineChanges.slice(0, 7),
  getRecipeChanges(manyBase, manyAfter(7), names),
  'the first seven are kept as they are',
);
assert.equal(
  nineChanges[7],
  'and 2 more',
  'the eighth says how many were left out',
);
assert.equal(
  getRecipeChanges(manyBase, manyAfter(12), names)[7],
  'and 5 more',
  'twelve changes: seven shown and five more',
);
const hugeName = new Map([['salt', { name: 'S'.repeat(500) }]]);
assert.ok(
  getRecipeChanges(
    baseRecipe,
    { ...baseRecipe, ingredients: [recipeLine('l2', 'salt', 9, 'TSP')] },
    hugeName,
  ).every((line) => line.length <= 200),
  'no line is longer than the rules allow',
);
const lastLine = (name: string) =>
  getRecipeChanges(
    baseRecipe,
    {
      ...baseRecipe,
      ingredients: [
        ...baseRecipe.ingredients,
        recipeLine('l9', 'long', 1, 'CUP'),
      ],
    },
    new Map([...names, ['long', { name }]]),
  )[0] ?? '';
const longLine = lastLine(`${'a'.repeat(192)}😀${'b'.repeat(50)}`);
assert.equal(
  longLine,
  `Added ${'a'.repeat(192)}…`,
  'a line cut inside an emoji drops the whole emoji instead of leaving half of it',
);
const emojiLine = lastLine('😀'.repeat(150));
assert.ok(
  emojiLine.length <= 200 && emojiLine.endsWith('…'),
  'a long line of emoji is cut by the rules’ count of 16-bit units and ends with …',
);
assert.equal(
  /[\uD800-\uDBFF]$/.test(emojiLine.slice(0, -1)),
  false,
  'a cut line never ends on half of an emoji',
);
assert.equal(
  lastLine('c'.repeat(193)),
  `Added ${'c'.repeat(193)}, 1 cup`.slice(0, 199).trimEnd() + '…',
  'a plain long line is cut at 199 characters and ends with …',
);
assert.equal(
  lastLine('d'.repeat(180)),
  `Added ${'d'.repeat(180)}, 1 cup`,
  'a line within the limit is not touched',
);
assert.deepEqual(
  changesFor({
    ingredients: [
      recipeLine('l1', 'garlic', 4.001, 'EACH'),
      baseRecipe.ingredients[1],
      baseRecipe.ingredients[2],
    ],
  }),
  ['The recipe changed'],
  'an amount that moved less than it prints never reads "4 → 4"',
);
assert.deepEqual(
  changesFor({ servings: 4.001 }),
  ['The recipe changed'],
  'servings that move less than they print never read "Serves 4 → 4"',
);
assert.deepEqual(
  changesFor({
    title: 'Adobo chicken thighs',
    ingredients: [
      recipeLine('l1', 'garlic', 4.001, 'EACH'),
      baseRecipe.ingredients[1],
      baseRecipe.ingredients[2],
    ],
  }),
  ['Renamed to “Adobo chicken thighs”'],
  'an unprinted amount change beside a real one adds no line of its own',
);
assert.deepEqual(
  getRecipeChanges(
    baseRecipe,
    {
      ...baseRecipe,
      ingredients: [
        ...baseRecipe.ingredients,
        recipeLine('l9', 'ghost', 1, 'EACH'),
      ],
    },
    names,
  ),
  ['Added Removed ingredient, 1 each'],
  'a line whose ingredient is gone still reads, as the drawer does',
);

const withCare = (care: unknown) => ({ ...baseRecipe, care }) as RecipeContent;
const fullCare = { fridgeDays: 3, freezerDays: 90, reheat: 'Oven.', tip: 'A.' };
assert.deepEqual(
  getRecipeChanges(
    withCare(fullCare),
    withCare({ fridgeDays: 5, freezerDays: null, reheat: null, tip: 'B.' }),
    names,
  ),
  [],
  'a change to the storage notes alone records nothing: the dish is the same',
);
assert.deepEqual(
  [
    getRecipeChanges(baseRecipe, withCare(fullCare), names),
    getRecipeChanges(withCare(fullCare), withCare(null), names),
    getRecipeChanges(withCare(null), withCare(undefined), names),
  ],
  [[], [], []],
  'adding, removing and a missing key are all nothing to record',
);
assert.deepEqual(
  getRecipeChanges(
    withCare(null),
    { ...withCare(fullCare), servings: 6 } as RecipeContent,
    names,
  ),
  ['Serves 4 → 6'],
  'storage notes changed beside a real change leave only the real line',
);

const fuzzRandom = ((seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
})(7);
const mutations: ((r: RecipeContent) => RecipeContent)[] = [
  (r) => ({ ...r, title: `${r.title}!` }),
  (r) => ({ ...r, servings: r.servings + 1 }),
  (r) => ({ ...r, prepMinutes: (r.prepMinutes ?? 0) + 1 }),
  (r) => ({ ...r, cookMinutes: null }),
  (r) => ({ ...r, description: r.description === null ? 'New.' : null }),
  (r) => ({ ...r, ingredients: r.ingredients.slice(1) }),
  (r) => ({ ...r, ingredients: [...r.ingredients].reverse() }),
  (r) => ({
    ...r,
    ingredients: [
      ...r.ingredients,
      recipeLine(`n${r.ingredients.length}`, 'lime', 1, 'TBSP'),
    ],
  }),
  (r) => ({
    ...r,
    ingredients: r.ingredients.map((l, i) =>
      i === 0 ? { ...l, amount: l.amount + 1 } : l,
    ),
  }),
  (r) => ({
    ...r,
    ingredients: r.ingredients.map((l, i) =>
      i === 1 ? { ...l, unit: 'CUP' as Unit } : l,
    ),
  }),
  (r) => ({
    ...r,
    ingredients: r.ingredients.map((l, i) =>
      i === 0 ? { ...l, note: 'fresh' } : l,
    ),
  }),
  (r) => ({ ...r, steps: r.steps.slice(0, -1) }),
  (r) => ({ ...r, steps: [...r.steps, 'Serve.'] }),
  (r) => ({ ...r, steps: [...r.steps].reverse() }),
  (r) => ({ ...r, steps: r.steps.map((s, i) => (i === 0 ? `${s} Well.` : s)) }),
  (r) => ({
    ...r,
    nutritionOverride: { calories: 400, protein: null, carbs: null, fat: null },
  }),
  (r) => ({ ...r, sourceId: r.sourceId === null ? 's1' : null }),
];
const fuzzMismatches = Array.from({ length: 600 }, () => {
  const before = mutations.reduce<RecipeContent>(
    (acc, mutate) => (fuzzRandom() < 0.2 ? mutate(acc) : acc),
    baseRecipe,
  );
  const after = mutations.reduce<RecipeContent>(
    (acc, mutate) => (fuzzRandom() < 0.2 ? mutate(acc) : acc),
    before,
  );
  const lines = getRecipeChanges(before, after, names, sourceNames);
  const isSame = JSON.stringify(before) === JSON.stringify(after);
  return (lines.length === 0) !== isSame || lines.length > 8
    ? { before, after, lines }
    : null;
}).filter((entry) => entry !== null);
assert.deepEqual(
  fuzzMismatches,
  [],
  'across 600 random pairs of edits, there are lines exactly when the recipe changed, never more than eight',
);

const noteOf = (
  id: string,
  recipeId: string,
  kind: 'NOTE' | 'TWEAK',
  createdAt: number,
) =>
  ({
    id,
    recipeId,
    kind,
    text: kind === 'NOTE' ? 'text' : null,
    changes: kind === 'NOTE' ? [] : ['Serves 4 → 6'],
    cookId: null,
    createdAt,
    updatedAt: createdAt,
  }) as RecipeNote;
const noteList = [
  noteOf('a', 'adobo', 'NOTE', 100),
  noteOf('b', 'rice', 'NOTE', 300),
  noteOf('c', 'adobo', 'TWEAK', 500),
  noteOf('d', 'adobo', 'NOTE', 500),
  noteOf('e', 'adobo', 'TWEAK', 200),
  noteOf('f', 'rice', 'NOTE', 50),
];
assert.deepEqual(
  groupNotesByRecipe(noteList)
    .get('adobo')
    ?.map((note) => note.id),
  ['c', 'd', 'e', 'a'],
  'a recipe lists its notes newest first, a tie by id',
);
assert.deepEqual(
  [...groupNotesByRecipe(noteList).keys()].sort(),
  ['adobo', 'rice'],
  'one group per recipe that has a note',
);
assert.equal(groupNotesByRecipe([]).size, 0, 'no notes gives no groups');
assert.deepEqual(
  [...getNoteSummaries(noteList).entries()].sort(([x], [y]) =>
    x.localeCompare(y),
  ),
  [
    ['adobo', { count: 4, lastTweakAt: 500 }],
    ['rice', { count: 2, lastTweakAt: null }],
  ],
  'the summary counts each recipe and keeps its latest tweak, in one pass',
);
assert.equal(
  getNoteSummaries([
    noteOf('x', 'adobo', 'TWEAK', 100),
    noteOf('y', 'adobo', 'TWEAK', 900),
    noteOf('z', 'adobo', 'NOTE', 1000),
  ]).get('adobo')?.lastTweakAt,
  900,
  'the last tweak is the latest tweak, not the latest note and not the order they arrive in',
);
assert.equal(getNoteSummaries(noteList).get('nachos'), undefined);
assert.equal(
  getNoteSummaries([
    noteOf('x', 'adobo', 'NOTE', 100),
    noteOf('y', 'adobo', 'TWEAK', -1_000_000_000_000),
  ]).get('adobo')?.lastTweakAt,
  -1_000_000_000_000,
  'a tweak before 1970 keeps its own time as the last one',
);
assert.equal(
  getWrittenBefore(noteOf('p', 'adobo', 'NOTE', 100), 500),
  500,
  'a note older than the latest tweak is labelled with that tweak',
);
assert.equal(
  getWrittenBefore(noteOf('p', 'adobo', 'NOTE', 500), 500),
  null,
  'a note made at the tweak’s moment is not before it',
);
assert.equal(
  getWrittenBefore(noteOf('p', 'adobo', 'NOTE', 900), 500),
  null,
  'a note after the tweak is not labelled',
);
assert.equal(
  getWrittenBefore(noteOf('p', 'adobo', 'TWEAK', 100), 500),
  null,
  'a tweak is never labelled',
);
assert.equal(
  getWrittenBefore(noteOf('p', 'adobo', 'NOTE', 100), null),
  null,
  'no tweak, no label',
);
const summaryDay = (at: number) => (at === 100 ? 'Oct 12' : 'Oct 6');
const summaryOf = (patch: Partial<RecipeNote>) =>
  getNoteSummary(
    { ...noteOf('s', 'adobo', 'NOTE', 100), ...patch },
    summaryDay,
  );
assert.deepEqual(
  summaryOf({ text: 'Use 6 cloves, it was bland' }),
  { label: 'Your latest note (Oct 12):', body: 'Use 6 cloves, it was bland' },
  'a note says its day and its words',
);
assert.deepEqual(
  summaryOf({ text: '  Use 6 cloves,\n\n  less\tvinegar  ' }).body,
  'Use 6 cloves, less vinegar',
  'line breaks and runs of spaces read as one space in the summary',
);
assert.deepEqual(
  summaryOf({
    kind: 'TWEAK',
    text: null,
    changes: ['White vinegar 0.5 → 0.25 cup'],
    createdAt: 200,
  }),
  { label: 'Changed on Oct 6:', body: 'White vinegar 0.5 → 0.25 cup' },
  'a tweak says what changed, so the recipe reads as having moved on',
);
assert.deepEqual(
  summaryOf({
    kind: 'TWEAK',
    text: 'Too sour',
    changes: ['White vinegar 0.5 → 0.25 cup', 'Serves 4 → 6'],
    createdAt: 200,
  }).body,
  'White vinegar 0.5 → 0.25 cup; Serves 4 → 6. Too sour',
  "a tweak lists its lines, then the reason in the person's words",
);
assert.deepEqual(
  summaryOf({ kind: 'TWEAK', text: null, changes: [], createdAt: 200 }),
  { label: 'Changed on Oct 6', body: '' },
  'a tweak with nothing to say keeps its heading without a colon',
);
assert.deepEqual(
  getNoteSummary(
    {
      id: 'x',
      recipeId: 'adobo',
      kind: 'NOTE',
      text: 'Old',
      createdAt: 100,
    } as RecipeNote,
    summaryDay,
  ).body,
  'Old',
  'an older note without the changes key still reads',
);
assert.deepEqual(
  getMissingNoteFields({ id: 'x', kind: 'NOTE', text: 't' }),
  { changes: [], cookId: null },
  'an older note gets the keys it lacks, empty',
);
assert.deepEqual(
  getMissingNoteFields({ text: null, changes: [], cookId: null }),
  {},
  'a note with every key, even null ones, lacks nothing',
);
assert.deepEqual(
  [
    '',
    '   ',
    'a',
    ' a ',
    'x'.repeat(2000),
    'x'.repeat(2001),
    `${' '.repeat(10)}${'x'.repeat(2000)}`,
  ].map(isValidNoteText),
  [false, false, true, true, true, false, true],
  'a note is 1 to 2,000 characters once trimmed',
);
assert.equal(getTweakReason('  because  '), 'because', 'a reason is trimmed');
assert.equal(getTweakReason('  \n '), null, 'a blank reason is none');
assert.equal(isNoteHistoryFull(299), false, '299 notes still fits');
assert.equal(isNoteHistoryFull(300), true, '300 notes is full');
const tracking = (
  isCooksReady: boolean,
  isNotesReady: boolean,
  cookCount: number,
  noteCount: number,
) => getTweakTracking({ isCooksReady, isNotesReady, cookCount, noteCount });
assert.equal(tracking(true, true, 3, 5), 'on', 'a cooked recipe is tracked');
assert.equal(tracking(true, true, 0, 5), 'off', 'a recipe never cooked is not');
assert.equal(
  tracking(false, true, 3, 5),
  'off',
  'nor while the cooks are unknown',
);
assert.equal(
  tracking(true, false, 3, 5),
  'off',
  'nor while the notes are unknown or failed',
);
assert.equal(tracking(true, true, 3, 300), 'full', 'a full journal says so');
assert.equal(
  tracking(true, true, 0, 300),
  'off',
  'a full journal of a recipe never cooked is still off',
);

const cookAt = (id: string, cookedAt: number) =>
  ({ id, recipeId: 'adobo', cookedAt }) as Cook;
const sixCooks = ['f', 'e', 'd', 'c', 'b', 'a'].map((id, index) =>
  cookAt(id, 6000 - index * 1000),
);
assert.deepEqual(
  getNoteCookChoices(sixCooks, null).map((cook) => cook.id),
  ['f', 'e', 'd', 'c'],
  'the latest four cooks are the answers',
);
assert.deepEqual(
  getNoteCookChoices(sixCooks, 'a').map((cook) => cook.id),
  ['f', 'e', 'd', 'c', 'a'],
  'an older cook already picked is kept, in its place by date',
);
assert.deepEqual(
  getNoteCookChoices(sixCooks.slice(0, 2), null).map((cook) => cook.id),
  ['f', 'e'],
  'fewer cooks give fewer answers',
);
assert.deepEqual(
  getCookChoiceLabels(
    [cookAt('x', 3), cookAt('y', 2), cookAt('z', 1)],
    (at) => (at === 1 ? 'Oct 11' : 'Oct 12'),
    (at) => `Oct 12, ${at} PM`,
  ),
  ['Oct 12, 3 PM', 'Oct 12, 2 PM', 'Oct 11'],
  'two cooks on one day show their times, and a day to itself stays short',
);

assert.deepEqual(
  [1, 2, 6, 7, 10, 14, 21, 29, 30, 31, 60, 90, 180, 360, 365].map(
    formatCareDays,
  ),
  [
    '1 day',
    '2 days',
    '6 days',
    '1 week',
    '10 days',
    '2 weeks',
    '3 weeks',
    '29 days',
    '1 month',
    '31 days',
    '2 months',
    '3 months',
    '6 months',
    '12 months',
    '365 days',
  ],
  'days read as the largest of months and weeks that fit exactly, else days, with the singular for one',
);
assert.equal(
  formatCareDays(210),
  '7 months',
  'a count that fits both months and weeks reads as months',
);
assert.equal(formatCareDays(28), '4 weeks', 'twenty-eight days is four weeks');

assert.equal(toCare(null), null, 'no care is null');
assert.equal(toCare(undefined), null, 'a missing key is null');
assert.equal(
  toCare({ fridgeDays: null, freezerDays: null, reheat: ' ', tip: '' }),
  null,
  'a record with nothing in it is null',
);
assert.deepEqual(
  toCare({ fridgeDays: 3, freezerDays: 0, reheat: ' Oven. ', tip: 7 }),
  { fridgeDays: 3, freezerDays: null, reheat: 'Oven.', tip: null },
  'a usable part is kept and trimmed; zero days and a non-string tip are dropped',
);
assert.deepEqual(
  toCare({ fridgeDays: 365 }),
  { fridgeDays: 365, freezerDays: null, reheat: null, tip: null },
  'a year is the longest and a partial record gains its missing keys as null',
);
assert.equal(toCare({ fridgeDays: 366 }), null, 'more than a year is not kept');
assert.equal(toCare({ fridgeDays: 2.5 }), null, 'part of a day is not kept');
assert.equal(toCare({ fridgeDays: '3' }), null, 'days must be a number');
assert.equal(
  toCare({ tip: 'x'.repeat(301) })?.tip?.length,
  300,
  'a long tip is cut to 300',
);
assert.equal(
  toCare({ reheat: 'y'.repeat(500) })?.reheat?.length,
  300,
  'a long reheating line is cut to 300',
);
assert.equal(
  getRecipeCare({}),
  null,
  'a recipe with no care key reads as no care',
);
assert.equal(
  getRecipeCare({ care: null }),
  null,
  'a recipe with care null reads as no care',
);
assert.deepEqual(
  getRecipeCare({
    care: { fridgeDays: 3, freezerDays: null, reheat: null, tip: null },
  }),
  { fridgeDays: 3, freezerDays: null, reheat: null, tip: null },
  'a recipe with care reads as it was written',
);

const careSummaryOf = (parts: Parameters<typeof toCare>[0]) =>
  getCareSummary(getCareText(toCare(parts)));
assert.equal(getCareSummary(EMPTY_CARE_TEXT), '', 'no care has no summary');
assert.equal(
  careSummaryOf({ fridgeDays: 3, freezerDays: 90 }),
  'Fridge 3 days, freezer 3 months',
  'the summary names each time',
);
assert.equal(
  careSummaryOf({ fridgeDays: 1, reheat: 'Oven.', tip: 'Apart.' }),
  'Fridge 1 day, reheating, tip',
  'reheating and a tip are named, not copied',
);
assert.equal(
  careSummaryOf({ tip: 'Apart.' }),
  'Tip',
  'a tip alone is just Tip',
);
assert.equal(
  careSummaryOf({ freezerDays: 60, tip: 'Apart.' }),
  'Freezer 2 months, tip',
  'the first word is capitalised whichever part comes first',
);
assert.equal(
  getCareSummary({ ...EMPTY_CARE_TEXT, fridge: '400' }),
  'Fridge 400 days',
  'days that cannot be used show as typed',
);
assert.equal(
  getCareSummary({
    ...EMPTY_CARE_TEXT,
    fridge: ' 2 ',
    freezer: '2.5',
    reheat: '  ',
  }),
  'Fridge 2 days, freezer 2.5 days',
  'typed days are trimmed, a bad one shows as typed and a blank reheating line is not named',
);

assert.equal(
  getLeftoversLine(null),
  null,
  'no care says nothing about leftovers',
);
assert.equal(
  getLeftoversLine(toCare({ fridgeDays: 3, freezerDays: 90 })),
  'Leftovers keep 3 days in the fridge, 3 months in the freezer',
  'the Finish line names both',
);
assert.equal(
  getLeftoversLine(toCare({ fridgeDays: 1 })),
  'Leftovers keep 1 day in the fridge',
  'one day is singular',
);
assert.equal(
  getLeftoversLine(toCare({ freezerDays: 60 })),
  'Leftovers keep 2 months in the freezer',
  'a freezer alone is named alone',
);
assert.equal(
  getLeftoversLine(toCare({ reheat: 'Oven.', tip: 'Apart.' })),
  null,
  'reheating and a tip alone give no keeping line',
);

assert.deepEqual(
  getCareText(null),
  EMPTY_CARE_TEXT,
  'no care opens the editor empty',
);
assert.deepEqual(
  getCareText(toCare({ fridgeDays: 3, reheat: 'Oven.' })),
  { fridge: '3', freezer: '', reheat: 'Oven.', tip: '' },
  'care opens the editor as text',
);
assert.equal(
  parseCareText(EMPTY_CARE_TEXT),
  null,
  'an empty editor is no care',
);
assert.deepEqual(
  parseCareText({ fridge: ' 3 ', freezer: '90', reheat: ' Oven. ', tip: '' }),
  { fridgeDays: 3, freezerDays: 90, reheat: 'Oven.', tip: null },
  'typed care is trimmed and blanks are null',
);
assert.equal(
  getCareProblem(EMPTY_CARE_TEXT),
  null,
  'nothing typed has no problem',
);
assert.equal(
  getCareProblem({ ...EMPTY_CARE_TEXT, fridge: '365', freezer: '1' }),
  null,
  'the ends of the range are fine',
);
['0', '366', '2.5', '-1', '1e2', 'abc', '3 days'].forEach((typed) => {
  assert.equal(
    getCareProblem({ ...EMPTY_CARE_TEXT, fridge: typed }),
    'Use whole days from 1 to 365 for the fridge',
    `fridge "${typed}" is a problem`,
  );
});
assert.equal(
  getCareProblem({ ...EMPTY_CARE_TEXT, fridge: '0', freezer: '400' }),
  'Use whole days from 1 to 365 for the fridge and freezer',
  'both bad days are named',
);
assert.equal(
  getCareProblem({ ...EMPTY_CARE_TEXT, reheat: 'y'.repeat(301) }),
  'Keep the reheating line to 300 characters or fewer',
  'a long reheating line is named',
);
assert.equal(
  getCareProblem({ ...EMPTY_CARE_TEXT, tip: 'x'.repeat(301) }),
  'Keep the tip to 300 characters or fewer',
  'a long tip is named',
);
assert.equal(
  getCareProblem({ ...EMPTY_CARE_TEXT, tip: 'x'.repeat(300) }),
  null,
  'a tip of exactly 300 is fine',
);

assert.equal(
  normalizeExtractedRecipe({ ingredients: [], steps: [], unread: [] }).care,
  null,
  'a reading that finds no storage lines leaves care null',
);
assert.deepEqual(
  normalizeExtractedRecipe({
    fridgeDays: 4.4,
    freezerDays: 90,
    reheat: ' Warm it in the oven. ',
    tip: null,
  }).care,
  { fridgeDays: 4, freezerDays: 90, reheat: 'Warm it in the oven.', tip: null },
  'a reading keeps what it found, rounded to whole days',
);
assert.deepEqual(
  [
    normalizeExtractedRecipe({ fridgeDays: 1.5 }).care?.fridgeDays,
    normalizeExtractedRecipe({ fridgeDays: 4.9 }).care?.fridgeDays,
    normalizeExtractedRecipe({ freezerDays: 90.2 }).care?.freezerDays,
  ],
  [1, 4, 90],
  'a reading rounds days down: a storage time is a safety figure, so 36 hours is 1 day',
);
assert.equal(
  normalizeExtractedRecipe({ fridgeDays: 0.5, freezerDays: -0.5 }).care,
  null,
  'half a day rounds to nothing and is dropped',
);
assert.equal(
  normalizeExtractedRecipe({ fridgeDays: 800, freezerDays: -2 }).care,
  null,
  'a reading with days outside 1 to 365 keeps neither',
);
assert.equal(
  normalizeExtractedRecipe({ fridgeDays: 'a week', reheat: 5, tip: {} }).care,
  null,
  'a reading with the wrong types keeps nothing',
);

assert.equal(
  getIdeaRecipeMethod(idea({ kind: 'LINK', url: 'https://example.com/a' })),
  'link',
  'a link idea starts from the link way',
);
assert.equal(
  getIdeaRecipeMethod(idea({ kind: 'LINK', url: 'not a link' })),
  'manual',
  'a link idea whose address can not be opened starts by hand',
);
assert.equal(
  getIdeaRecipeMethod(idea({ kind: 'LINK', url: null })),
  'manual',
  'a link idea with no address starts by hand',
);
assert.equal(
  getIdeaRecipeMethod(idea({ kind: 'PHOTO', url: null })),
  'manual',
  'a photo idea starts by hand',
);
assert.equal(
  getIdeaRecipeMethod(idea({ kind: 'TEXT', url: 'https://example.com/a' })),
  'manual',
  'a typed note starts by hand',
);

const reading: ExtractedRecipe = {
  title: 'Chicken adobo',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 40,
  description: 'Soy and vinegar, braised.',
  ingredients: [{ name: 'chicken thigh', amount: 2, unit: 'LB', note: null }],
  steps: ['Braise.'],
  unread: [],
};
const linkIdea = idea({
  kind: 'LINK',
  url: 'https://www.seriouseats.com/adobo',
  title: 'My adobo',
  note: 'Mom likes it',
});
assert.deepEqual(
  getReadingForIdea(reading, linkIdea),
  { ...reading, title: 'My adobo', description: 'Mom likes it' },
  "a reading keeps the idea's own title and note and fills the rest",
);
assert.equal(
  getReadingForIdea(reading, { ...linkIdea, note: '  ' }).description,
  'Soy and vinegar, braised.',
  'a blank note leaves the page description',
);
assert.equal(
  getReadingForIdea(reading, { ...linkIdea, title: 'SeriousEats.com' }).title,
  'Chicken adobo',
  "a title that is only the site's name gives way to the recipe's",
);
assert.equal(
  getReadingForIdea(
    { ...reading, title: null },
    {
      ...linkIdea,
      title: 'seriouseats.com',
    },
  ).title,
  'seriouseats.com',
  'no recipe title leaves the idea title as it was',
);
assert.deepEqual(
  getReadingForIdea(reading, linkIdea).ingredients,
  reading.ingredients,
  'the ingredients and steps are the reading’s own',
);

assert.equal(formatRowPrice(0, false), '$0.00', 'a known free item is priced');

const gap = (kind: Gap['kind'], ingredientId: string) =>
  ({ kind, ingredientId }) as Gap;
const leftOutOnDay = [
  gap('NO_PRODUCT', 'garlic'),
  gap('NO_PRODUCT', 'garlic'),
  gap('NO_PRODUCT', 'vinegar'),
  gap('NOT_COMPARABLE', 'soy'),
  gap('NO_PRODUCT', 'rice'),
];
assert.equal(
  countLeftOutIngredients(leftOutOnDay),
  4,
  'an ingredient in several meals counts once',
);
const DAY = 86_400_000;
const localAt = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const dayOf = (day: number) => Date.UTC(2026, 9, day);
const lateOnThe14th = localAt(14, 23, 30);
const earlyOnThe15th = localAt(15, 0, 30);

assert.equal(
  getDaysLeft(dayOf(14), lateOnThe14th),
  0,
  "eat-by today is today at 23:30 local, whatever the zone's offset from UTC",
);
assert.equal(
  getDaysLeft(dayOf(14), earlyOnThe15th),
  -1,
  'a minute past local midnight, yesterday is yesterday',
);
assert.deepEqual(
  [12, 13, 14, 15, 16, 17, 18].map((day) =>
    getEatByState(dayOf(day), lateOnThe14th),
  ),
  ['PAST', 'PAST', 'SOON', 'SOON', 'LATER', 'LATER', 'LATER'],
  'eat soon is today and tomorrow, past its date is any day before today',
);
assert.deepEqual(
  [13, 14, 15, 16, 17].map((day) => getEatByState(dayOf(day), earlyOnThe15th)),
  ['PAST', 'PAST', 'SOON', 'SOON', 'LATER'],
  'the same classification just after local midnight',
);
assert.deepEqual(
  [14, 15, 16].map((day) => getEatByPhrase(dayOf(day), lateOnThe14th)),
  [
    'today',
    'tomorrow',
    new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(dayOf(16)),
  ],
  'today and tomorrow are named, any other day is the date read in UTC',
);

const careOf = (fridgeDays: number | null, freezerDays: number | null) => ({
  fridgeDays,
  freezerDays,
  reheat: null,
  tip: null,
});
const todayOn14 = Date.UTC(2026, 9, 14);
assert.deepEqual(
  [
    getEatByDefault('FRIDGE', null, lateOnThe14th),
    getEatByDefault('FREEZER', null, lateOnThe14th),
    getEatByDefault('THAW', null, lateOnThe14th),
  ].map((preset) => [
    preset.days,
    preset.eatBy - todayOn14,
    preset.isFromRecipe,
  ]),
  [
    [4, 4 * DAY, false],
    [90, 90 * DAY, false],
    [2, 2 * DAY, false],
  ],
  'with no care, the fridge starts at a few days, the freezer at a few months and a thawed one at a short window, counted from the local day',
);
assert.deepEqual(
  [
    getEatByDefault('FRIDGE', careOf(3, 120), lateOnThe14th),
    getEatByDefault('FREEZER', careOf(3, 120), lateOnThe14th),
    getEatByDefault('FREEZER', careOf(3, null), lateOnThe14th),
  ].map((preset) => [preset.days, preset.isFromRecipe]),
  [
    [3, true],
    [120, true],
    [90, false],
  ],
  "a recipe's own days win where it has them, and a missing freezer time falls back",
);
assert.deepEqual(
  [
    getEatByDefault('THAW', careOf(5, 90), lateOnThe14th),
    getEatByDefault('THAW', careOf(1, 90), lateOnThe14th),
  ].map((preset) => [preset.days, preset.isFromRecipe]),
  [
    [2, false],
    [1, true],
  ],
  'a thawed container takes the shorter of the thawed window and the recipe fridge time',
);
assert.match(
  getEatByHint('FREEZER', getEatByDefault('FREEZER', careOf(3, 90))),
  /^Your call\. Taken from the freezer time in your recipe\.$/,
  'the hint says whose call it is and never claims the food is safe',
);
assert.match(
  getEatByHint('THAW', getEatByDefault('THAW', null)),
  /^Your call\. Once thawed, this starts at 2 days\.$/,
);
assert.doesNotMatch(
  [
    getEatByHint('FRIDGE', getEatByDefault('FRIDGE', null)),
    getEatByHint('FRIDGE', getEatByDefault('FRIDGE', careOf(3, null))),
    getEatByHint('FREEZER', getEatByDefault('FREEZER', careOf(3, 90))),
    getEatByHint('THAW', getEatByDefault('THAW', null)),
  ].join(' '),
  /safe|keeps|spoil|fresh/i,
  'no copy about eat-by dates claims food safety or says how long food keeps',
);

const container = (over: Partial<Container> = {}): Container => ({
  id: 'c1',
  title: 'Adobo chicken',
  recipeId: 'adobo',
  mealId: null,
  cookId: null,
  servings: 4,
  status: 'IN_STOCK',
  place: 'FRIDGE',
  eatBy: dayOf(17),
  history: [makeEvent('FRIDGE', 1000, { servings: 4, place: 'FRIDGE' })],
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});
const planOf = (plan: ReturnType<typeof planEat>) => {
  assert.ok('fields' in plan, 'expected a change, got an error');
  return plan.fields;
};
const errorOf = (plan: ReturnType<typeof planEat>) => {
  assert.ok('error' in plan, 'expected an error, got a change');
  return plan.error;
};

const ate = planOf(planEat(container(), 1, 5000));
assert.deepEqual(
  [
    ate.servings,
    ate.status,
    ate.history?.at(-1)?.kind,
    ate.history?.at(-1)?.servings,
  ],
  [3, undefined, 'EAT', 1],
  'eating one lowers the servings and adds an EAT',
);
const ateAll = planOf(planEat(container({ servings: 2 }), 'ALL', 5000));
assert.deepEqual(
  [ateAll.status, ateAll.servings, ateAll.history?.at(-1)?.servings],
  ['DONE', undefined, 2],
  'eating all that is left finishes it and keeps the history, writing no servings',
);
assert.equal(
  planOf(planEat(container({ servings: 2 }), 2, 5000)).status,
  'DONE',
  'eating exactly what is left finishes it too',
);
assert.match(
  errorOf(planEat(container({ servings: 1 }), 2, 5000)),
  /Only 1 serving is left/,
  'a count above what another device left stops the change with one sentence',
);
assert.deepEqual(
  [0, -1, 1.5, Number.NaN].map(
    (count) => 'error' in planEat(container(), count, 5000),
  ),
  [true, true, true, true],
  'eating needs whole portions above zero',
);
assert.match(
  errorOf(planEat(container({ status: 'DONE' }), 1, 5000)),
  /already finished/,
  'a finished container cannot be eaten again',
);
assert.equal(
  planOf(planToss(container({ servings: 3 }), 5000)).history?.at(-1)?.servings,
  3,
  'throwing it out records what was left',
);
assert.equal(planOf(planToss(container(), 5000)).status, 'DONE');
assert.match(
  errorOf(planToss(container({ status: 'DONE' }), 5000)),
  /already finished/,
);

const clearedOne = planOf(planClear(container({ servings: 3 }), 5000));
assert.deepEqual(
  [
    clearedOne.status,
    clearedOne.servings,
    clearedOne.place,
    clearedOne.history?.at(-1),
    clearedOne.updatedAt,
  ],
  [
    'DONE',
    undefined,
    undefined,
    { kind: 'CLEAR', at: 5000, servings: 3, place: null, note: null },
    5000,
  ],
  'clearing one out finishes it with one CLEAR that records what was left, and keeps its place and servings',
);
assert.match(
  errorOf(planClear(container({ status: 'DONE' }), 5000)),
  /already finished/,
  'a finished container is not cleared again',
);
assert.deepEqual(
  planClearOut(
    [
      container({ id: 'a' }),
      null,
      container({ id: 'b', status: 'DONE' }),
      container({ id: 'c', place: 'FREEZER' }),
      container({ id: 'd', servings: 2 }),
    ],
    'FRIDGE',
    5000,
  ).map(({ id, fields }) => [id, fields.history?.at(-1)?.servings]),
  [
    ['a', 4],
    ['d', 2],
  ],
  'a clear-out skips a container that is gone, finished or moved to the other place since the tap',
);
const afterClear = container({
  servings: 3,
  status: 'DONE',
  history: [
    ...container().history,
    makeEvent('EAT', 4000, { servings: 1 }),
    makeEvent('CLEAR', 5000, { servings: 3 }),
  ],
});
assert.deepEqual(
  [
    planOf(planUndoEnd(afterClear, 5000, 9000)).status,
    planOf(planUndoEnd(afterClear, 5000, 9000)).servings,
    planOf(planUndoEnd(afterClear, 5000, 9000)).history?.at(-1)?.kind,
  ],
  ['IN_STOCK', 3, 'EAT'],
  'undoing a clear-out puts it back in stock with what it had and drops the CLEAR',
);
assert.match(
  errorOf(
    planUndoEnd(
      {
        ...afterClear,
        status: 'IN_STOCK',
        history: [
          ...afterClear.history,
          makeEvent('FREEZE', 6000, { servings: 3, place: 'FREEZER' }),
        ],
      },
      5000,
      9000,
    ),
  ),
  /could not be undone/,
  'a clear-out that something else followed is not undone',
);
assert.match(
  errorOf(planUndoEnd(afterClear, 4999, 9000)),
  /could not be undone/,
  'an undo for another clear-out does nothing',
);
const clearedFull = planOf(
  planClear(
    container({
      servings: 2,
      history: [
        makeEvent('MADE', 0, { servings: 12 }),
        makeEvent('FREEZE', 1, { servings: 8, place: 'FREEZER' }),
        ...Array.from({ length: MAX_CONTAINER_HISTORY - 2 }, (_, i) =>
          makeEvent('EAT', i + 2, { servings: 1 }),
        ),
      ],
    }),
    99,
  ),
).history;
assert.deepEqual(
  [
    clearedFull?.length,
    clearedFull?.at(-1)?.kind,
    clearedFull?.slice(0, 2).map((entry) => entry.kind),
  ],
  [MAX_CONTAINER_HISTORY, 'CLEAR', ['MADE', 'FREEZE']],
  'past the cap a clear-out drops the oldest EAT, never the CLEAR it adds or what went in',
);
assert.deepEqual(
  [
    getEventText(makeEvent('CLEAR', 1, { servings: 3 })),
    getEventText(makeEvent('CLEAR', 1)),
    getClearOutMessage(9, 24, 'FRIDGE'),
    getClearOutMessage(1, 1, 'FREEZER'),
    getPutBackText(9, 9),
    getPutBackText(1, 1),
    getPutBackText(7, 9),
  ],
  [
    'Cleared out · 3 servings',
    'Cleared out',
    'This takes 9 boxes (24 servings) out of the fridge and keeps them in What you finished as cleared out. You can undo it right after.',
    'This takes 1 box (1 serving) out of the freezer and keeps it in What you finished as cleared out. You can undo it right after.',
    'Put 9 boxes back',
    'Put 1 box back',
    'Put back 7 of 9; the rest changed since',
  ],
  'a clear-out says what it takes out of which place and what it keeps, and the Undo says how many came back',
);

const doorOf = (overrides: Partial<Parameters<typeof getFinishedDoor>[0]>) =>
  getFinishedDoor({
    isListShown: true,
    isScoped: false,
    hasStockInScope: true,
    finishedCount: 0,
    isRead: true,
    ...overrides,
  });
assert.deepEqual(
  [
    doorOf({ finishedCount: 3 }),
    doorOf({ finishedCount: 0, isRead: true }),
    doorOf({ finishedCount: 0, isRead: false }),
    doorOf({ finishedCount: 3, isListShown: false }),
  ],
  ['SHOW', 'HIDE', 'HOLD', 'HIDE'],
  'the door to What you finished shows only once something is finished, holds its place while the read lands, and is not drawn when the read found nothing or the list is not shown',
);
assert.deepEqual(
  [
    doorOf({ isScoped: true, hasStockInScope: true, isRead: false }),
    doorOf({ isScoped: true, hasStockInScope: false, isRead: false }),
    doorOf({ isScoped: true, hasStockInScope: false, isRead: true }),
  ],
  ['SHOW', 'HOLD', 'HIDE'],
  'a recipe or meal scope with boxes in stock shows the door without reading its (up to 200) containers, and one with nothing in stock waits for the read',
);

const toFreezer = planOf(planMove(container(), 'FREEZER', dayOf(20), 6000));
assert.deepEqual(
  [
    toFreezer.place,
    toFreezer.eatBy,
    toFreezer.history?.at(-1)?.kind,
    toFreezer.history?.at(-1)?.place,
    toFreezer.history?.at(-1)?.servings,
  ],
  ['FREEZER', dayOf(20), 'FREEZE', 'FREEZER', 4],
  'putting it in the freezer moves it whole, sets the eat-by and adds a FREEZE',
);
const toFridge = planOf(
  planMove(container({ place: 'FREEZER' }), 'FRIDGE', dayOf(16), 6000),
);
assert.deepEqual(
  [toFridge.place, toFridge.history?.at(-1)?.kind],
  ['FRIDGE', 'THAW'],
  'moving it out of the freezer is a THAW',
);
assert.match(
  errorOf(planMove(container(), 'FRIDGE', dayOf(20), 6000)),
  /already in the fridge/,
);
assert.match(
  errorOf(planMove(container(), 'FREEZER', dayOf(20) + 3_600_000, 6000)),
  /day to eat it by/,
  'an eat-by that is not a whole UTC day is refused',
);
assert.match(
  errorOf(planMove(container({ status: 'DONE' }), 'FREEZER', dayOf(20), 6000)),
  /already finished/,
);

const edited = planOf(planEatBy(container(), dayOf(19), 7000));
assert.deepEqual(
  [
    edited.eatBy,
    edited.history?.at(-1)?.kind,
    edited.history?.at(-1)?.note?.includes('→'),
  ],
  [dayOf(19), 'EDIT', true],
  'changing the eat-by adds an EDIT that names both days',
);
assert.match(
  errorOf(planEatBy(container(), dayOf(17), 7000)),
  /already the eat-by/,
);
assert.match(errorOf(planEatBy(container(), 5.5, 7000)), /day to eat it by/);
assert.ok(
  (edited.history?.at(-1)?.note?.length ?? 0) <= MAX_CONTAINER_NOTE_LENGTH,
  'the note fits what the rules allow',
);

const afterEat = container({
  servings: 3,
  history: [...container().history, makeEvent('EAT', 5000, { servings: 1 })],
});
const undone = planOf(planUndoEnd(afterEat, 5000, 9000));
assert.deepEqual(
  [undone.servings, undone.status, undone.history?.length],
  [4, 'IN_STOCK', 1],
  'undoing an eat gives the portion back and removes the event',
);
const afterAll = container({
  servings: 2,
  status: 'DONE',
  history: [...container().history, makeEvent('EAT', 5000, { servings: 2 })],
});
const reopened = planOf(planUndoEnd(afterAll, 5000, 9000));
assert.deepEqual(
  [reopened.servings, reopened.status],
  [2, 'IN_STOCK'],
  'undoing the last portion reopens it with the portions it ended with',
);
assert.match(
  errorOf(planUndoEnd(afterEat, 4999, 9000)),
  /could not be undone/,
  'an undo for a different moment does nothing',
);
const followedByMove = {
  ...afterEat,
  history: [
    ...afterEat.history,
    makeEvent('FREEZE', 6000, { servings: 3, place: 'FREEZER' }),
  ],
};
assert.match(
  errorOf(planUndoEnd(followedByMove, 5000, 9000)),
  /could not be undone/,
  'an eat that something else followed is not undone',
);

const eventAt = (n: number, kind: ContainerEvent['kind'] = 'EAT') =>
  makeEvent(kind, n, { servings: 1 });
const fullHistory = Array.from({ length: MAX_CONTAINER_HISTORY }, (_, i) =>
  i === 0
    ? makeEvent('FREEZE', 0, { servings: 8, place: 'FREEZER' })
    : eventAt(i),
);
const capped = appendEvent(fullHistory, eventAt(99));
assert.equal(
  capped.length,
  MAX_CONTAINER_HISTORY,
  'the history never grows past the cap',
);
assert.deepEqual(
  [capped[0].kind, capped[0].at, capped[1].at, capped.at(-1)?.at],
  ['FREEZE', 0, 2, 99],
  'past the cap the first event stays and the oldest EAT goes',
);
const movesOnly = Array.from({ length: MAX_CONTAINER_HISTORY }, (_, i) =>
  makeEvent(i % 2 === 0 ? 'FREEZE' : 'THAW', i, {
    servings: 2,
    place: i % 2 === 0 ? 'FREEZER' : 'FRIDGE',
  }),
);
assert.deepEqual(
  appendEvent(movesOnly, eventAt(99))
    .map((entry) => entry.at)
    .slice(0, 3),
  [0, 2, 3],
  'with no EAT to drop, the oldest event after the first goes',
);
const longRunOfMoves = [
  makeEvent('MADE', 0, { servings: 12 }),
  makeEvent('FRIDGE', 1, { servings: 8, place: 'FRIDGE' }),
  ...Array.from({ length: MAX_CONTAINER_HISTORY - 2 }, (_, i) =>
    makeEvent(i % 2 === 0 ? 'FREEZE' : 'THAW', i + 2, {
      servings: 6,
      place: i % 2 === 0 ? 'FREEZER' : 'FRIDGE',
    }),
  ),
];
const afterOneMoreFreeze = appendEvent(
  longRunOfMoves,
  makeEvent('FREEZE', 99, { servings: 6, place: 'FREEZER' }),
);
assert.deepEqual(
  [
    afterOneMoreFreeze.length,
    afterOneMoreFreeze.map((entry) => entry.kind).slice(0, 2),
    getStartServings({ history: afterOneMoreFreeze } as Container),
    getFreezeCount(afterOneMoreFreeze),
    afterOneMoreFreeze.map((entry) => entry.at).slice(2, 4),
  ],
  [MAX_CONTAINER_HISTORY, ['MADE', 'FRIDGE'], 8, 5, [2, 4]],
  'a long run of moves drops the oldest thaw after the first place event: the 8 that went in and every freeze stay',
);
const cookEdits = [
  makeEvent('MADE', 0, { servings: 4 }),
  makeEvent('FREEZE', 1, { servings: 4, place: 'FREEZER' }),
  ...Array.from({ length: MAX_CONTAINER_HISTORY - 2 }, (_, i) =>
    makeEvent('EDIT', i + 2, { note: 'Eat by moved' }),
  ),
];
const afterNineEdits = appendEvent(cookEdits, makeEvent('EDIT', 99));
assert.deepEqual(
  [
    afterNineEdits.length,
    afterNineEdits.map((entry) => entry.kind).slice(0, 2),
    afterNineEdits.map((entry) => entry.at).slice(2, 4),
    getFreezeCount(afterNineEdits),
  ],
  [MAX_CONTAINER_HISTORY, ['MADE', 'FREEZE'], [3, 4], 1],
  'a cook container with many eat-by edits keeps where it went: the oldest EDIT goes, not its FREEZE',
);
assert.deepEqual(
  appendEvent(
    [
      makeEvent('MADE', 0, { servings: 4 }),
      makeEvent('EDIT', 1, { note: 'x' }),
      makeEvent('EAT', 2, { servings: 1 }),
      ...cookEdits.slice(3),
    ],
    makeEvent('EDIT', 99),
  )
    .map((entry) => entry.at)
    .slice(0, 3),
  [0, 1, 3],
  'an EAT goes before an EDIT, wherever each sits',
);
assert.deepEqual(
  [
    getLastPlaceEvent([]),
    getLastPlaceEvent([
      makeEvent('FREEZE', 1, { servings: 4, place: 'FREEZER' }),
      makeEvent('THAW', 2, { servings: 4, place: 'FRIDGE' }),
      eventAt(3),
      makeEvent('EDIT', 4, { note: 'x' }),
    ])?.kind,
  ],
  [undefined, 'THAW'],
  'the last place event is the last one that says where it went, whatever came after',
);
assert.equal(
  appendEvent([eventAt(1)], eventAt(2)).length,
  2,
  'a short history only grows',
);
assert.equal(
  makeEvent('EDIT', 1, { note: 'x'.repeat(200) }).note?.length,
  MAX_CONTAINER_NOTE_LENGTH,
  'a long note is cut to what the rules allow',
);

assert.deepEqual(
  [
    getFreezeLine([]),
    getFreezeLine([makeEvent('FREEZE', 1, { servings: 1, place: 'FREEZER' })]),
    getFreezeLine([
      makeEvent('FREEZE', 1, { servings: 1, place: 'FREEZER' }),
      makeEvent('THAW', 2, { servings: 1, place: 'FRIDGE' }),
      makeEvent('FREEZE', 3, { servings: 1, place: 'FREEZER' }),
    ]),
    getFreezeLine(
      [1, 2, 3].map((n) =>
        makeEvent('FREEZE', n, { servings: 1, place: 'FREEZER' }),
      ),
    ),
  ],
  [null, null, 'Frozen twice', 'Frozen 3 times'],
  'the history says "Frozen twice" once it has gone in more than once, and nothing for one freeze',
);

const cookInput = {
  id: 'c2',
  title: '  Adobo chicken ',
  recipeId: 'adobo',
  mealId: null,
  cookId: 'cook-1',
  madeServings: 8,
  servings: 4,
  place: 'FREEZER' as const,
  eatBy: dayOf(30),
};
const fromCook = buildContainer(cookInput, 8000);
assert.deepEqual(
  [
    fromCook.history.map((entry) => [entry.kind, entry.servings]),
    fromCook.title,
    fromCook.status,
    'madeServings' in fromCook,
  ],
  [
    [
      ['MADE', 8],
      ['FREEZE', 4],
    ],
    'Adobo chicken',
    'IN_STOCK',
    false,
  ],
  'a container from a cook starts with MADE for what the cook made, then where it went and how many',
);
assert.deepEqual(
  buildContainer(
    { ...cookInput, cookId: null, madeServings: null, place: 'FRIDGE' },
    8000,
  ).history.map((entry) => entry.kind),
  ['FRIDGE'],
  'a container added by hand is born where it went: no MADE, one event',
);
assert.deepEqual(
  [
    buildContainer({ ...cookInput, madeServings: 4.5 }, 1).history[0].servings,
    buildContainer({ ...cookInput, madeServings: 250 }, 1).history[0].servings,
    buildContainer({ ...cookInput, madeServings: 0.2 }, 1).history[0].servings,
  ],
  [5, MAX_CONTAINER_SERVINGS, 1],
  'a cook of half servings or past 100 is written as the whole number the rules take',
);
assert.equal(
  getStartServings(fromCook),
  4,
  'what went in is the first place event, not what the cook made',
);
assert.deepEqual(
  [
    getNewContainerProblem({ ...fromCook, title: ' ' }, 0),
    getNewContainerProblem({ ...fromCook, mealId: 'meal' }, 0),
    getNewContainerProblem({ ...fromCook, servings: 0 }, 0),
    getNewContainerProblem({ ...fromCook, servings: 1.5 }, 0),
    getNewContainerProblem(
      { ...fromCook, servings: MAX_CONTAINER_SERVINGS + 1 },
      0,
    ),
    getNewContainerProblem({ ...fromCook, eatBy: dayOf(30) + 5 }, 0),
    getNewContainerProblem(fromCook, 500),
    getNewContainerProblem(fromCook, 499),
  ].map((problem) => problem !== null),
  [true, true, true, true, true, true, true, false],
  'a new container needs a name, one source, whole servings from 1 to 100, a whole-day eat-by, and room on the list',
);
assert.deepEqual(
  [
    isValidEatBy(MIN_EAT_BY_DATE),
    isValidEatBy(MAX_EAT_BY_DATE),
    isValidEatBy(MIN_EAT_BY_DATE - DAY),
    isValidEatBy(MAX_EAT_BY_DATE + DAY),
    isValidEatBy(dayOf(14) + 1),
    isValidEatBy(Number.NaN),
  ],
  [true, true, false, false, false, false],
  'an eat-by is a whole UTC day between 2000 and 2100',
);
assert.deepEqual([0, 1, 100, 101, 2.5].map(isValidContainerServings), [
  false,
  true,
  true,
  false,
  false,
]);

const longTitle = buildContainer(
  { ...fromCook, title: `  ${'Sheet-pan chicken '.repeat(9)}` },
  8000,
).title;
assert.deepEqual(
  [longTitle.length, longTitle.startsWith('Sheet-pan chicken')],
  [MAX_CONTAINER_TITLE_LENGTH, true],
  'a recipe title past what the rules take is cut, so it can still be put away',
);

const frozenLongAgo = container({
  place: 'FREEZER',
  eatBy: dayOf(11),
  history: [makeEvent('FREEZE', 1, { servings: 4, place: 'FREEZER' })],
});
const thawPast = getEatByDefault('THAW', null, lateOnThe14th, dayOf(11));
assert.deepEqual(
  [thawPast.eatBy, thawPast.wasPast, thawPast.isKept],
  [dayOf(11), true, true],
  'thawing something already past its date keeps that date',
);
assert.deepEqual(
  [
    getEatByDefault('FREEZER', null, lateOnThe14th, dayOf(11)).eatBy,
    getEatByDefault('FRIDGE', null, lateOnThe14th, dayOf(11)).wasPast,
  ],
  [dayOf(11), true],
  'any move of a container already past its date keeps the date',
);
assert.deepEqual(
  [
    getEatByDefault('THAW', null, lateOnThe14th, dayOf(90)),
    getEatByDefault('THAW', null, lateOnThe14th, dayOf(15)),
    getEatByDefault('THAW', null, lateOnThe14th, null),
  ].map((preset) => [preset.eatBy, preset.isKept, preset.wasPast]),
  [
    [dayOf(16), false, false],
    [dayOf(15), true, false],
    [dayOf(16), false, false],
  ],
  'thawing in date starts at the shorter of the current eat-by and the thaw window',
);
assert.equal(
  getEatByDefault('FREEZER', null, lateOnThe14th, dayOf(15)).eatBy,
  dayOf(14) + 90 * DAY,
  'moving an in-date fridge container into the freezer starts fresh from today',
);
assert.deepEqual(
  [
    getEatByHint('THAW', thawPast),
    getEatByHint(
      'THAW',
      getEatByDefault('THAW', null, lateOnThe14th, dayOf(15)),
    ),
  ],
  [
    'Your call. The date stays as it was.',
    'Your call. It already had an earlier date, so that stays.',
  ],
);
assert.doesNotMatch(
  [
    getEatByHint('THAW', thawPast),
    getEatByHint(
      'THAW',
      getEatByDefault('THAW', null, lateOnThe14th, dayOf(15)),
    ),
  ].join(' '),
  /safe|keeps|spoil|fresh/i,
  'the kept-date hints make no claim about food either',
);
const twiceFrozen = container({
  history: [
    makeEvent('FREEZE', 1, { servings: 4, place: 'FREEZER' }),
    makeEvent('THAW', 2, { servings: 4, place: 'FRIDGE' }),
    makeEvent('FREEZE', 3, { servings: 4, place: 'FREEZER' }),
    makeEvent('THAW', 4, { servings: 4, place: 'FRIDGE' }),
  ],
});
assert.deepEqual(
  [
    getMoveNotes(frozenLongAgo, 'THAW', thawPast),
    getMoveNotes(
      container({
        history: [
          makeEvent('FREEZE', 1, { servings: 4, place: 'FREEZER' }),
          makeEvent('THAW', 2, { servings: 4, place: 'FRIDGE' }),
        ],
      }),
      'FREEZER',
      getEatByDefault('FREEZER', null, lateOnThe14th, dayOf(15)),
    ),
    getMoveNotes(
      twiceFrozen,
      'FREEZER',
      getEatByDefault('FREEZER', null, lateOnThe14th, dayOf(15)),
    ),
    getMoveNotes(
      container({
        history: [makeEvent('FRIDGE', 1, { servings: 4, place: 'FRIDGE' })],
      }),
      'FREEZER',
      getEatByDefault('FREEZER', null, lateOnThe14th, dayOf(15)),
    ),
    getMoveNotes(
      container({
        history: [makeEvent('FRIDGE', 1, { servings: 4, place: 'FRIDGE' })],
      }),
      'FREEZER',
      getEatByDefault('FREEZER', null, lateOnThe14th, dayOf(11)),
    ),
  ],
  [
    ['It was past its date before it was moved.'],
    ["It's been frozen once before."],
    ["It's been frozen twice before."],
    [],
    ['It was past its date before it was moved.'],
  ],
  'a move says plainly when it was already past its date and when it has been frozen before, and nothing about safety',
);

const countPlan = planCount(container({ servings: 3 }), 4, 9000);
assert.deepEqual(
  'fields' in countPlan
    ? [
        countPlan.fields.servings,
        countPlan.fields.history.at(-1)?.kind,
        countPlan.fields.history.at(-1)?.note,
        countPlan.fields.history.at(-1)?.servings,
      ]
    : countPlan,
  [4, 'EDIT', 'Count 3 → 4', null],
  'correcting the count writes the number and one EDIT that says what changed',
);
assert.deepEqual(
  [
    planCount(container({ servings: 3 }), 3, 1),
    planCount(container({ servings: 3 }), 0, 1),
    planCount(container({ servings: 3 }), 101, 1),
    planCount(container({ servings: 3, status: 'DONE' }), 4, 1),
  ].map((plan) => ('error' in plan ? plan.error : null)),
  [
    'That is already the count.',
    'Pick a count from 1 to 100.',
    'Pick a count from 1 to 100.',
    'This one is already finished.',
  ],
  'a count correction stays within 1 to 100 and only changes something that is in stock',
);
const longestCount = planCount(container({ servings: 100 }), 99, 1);
assert.ok(
  'fields' in longestCount &&
    (longestCount.fields.history.at(-1)?.note?.length ?? Infinity) <=
      MAX_CONTAINER_NOTE_LENGTH,
  'the longest count note fits the rules',
);

const freezeHeavy = [
  makeEvent('MADE', 0, { servings: 8 }),
  ...Array.from({ length: MAX_CONTAINER_HISTORY - 1 }, (_, i) =>
    i % 2 === 0
      ? makeEvent('FREEZE', i + 1, { servings: 4, place: 'FREEZER' })
      : makeEvent('THAW', i + 1, { servings: 4, place: 'FRIDGE' }),
  ),
];
const afterThawAndRefreeze = appendEvent(
  appendEvent(
    freezeHeavy,
    makeEvent('THAW', 50, { servings: 4, place: 'FRIDGE' }),
  ),
  makeEvent('FREEZE', 51, { servings: 4, place: 'FREEZER' }),
);
assert.deepEqual(
  [
    getFreezeCount(freezeHeavy),
    getFreezeCount(afterThawAndRefreeze),
    afterThawAndRefreeze.length,
    afterThawAndRefreeze[0].kind,
  ],
  [5, 6, MAX_CONTAINER_HISTORY, 'MADE'],
  'past the cap the cap drops thaws before any FREEZE, so the freeze count is the true one',
);

const finishedOf = (history: ContainerEvent[]) =>
  getFinishedText(container({ status: 'DONE', servings: 1, history }));
assert.deepEqual(
  [
    finishedOf([
      makeEvent('FRIDGE', 1, { servings: 4, place: 'FRIDGE' }),
      makeEvent('EAT', 2, { servings: 3 }),
      makeEvent('TOSS', 3, { servings: 1 }),
    ]),
    finishedOf([
      makeEvent('MADE', 0, { servings: 8 }),
      makeEvent('FRIDGE', 1, { servings: 4, place: 'FRIDGE' }),
      makeEvent('EAT', 2, { servings: 4 }),
    ]),
    finishedOf([
      makeEvent('FRIDGE', 1, { servings: 4, place: 'FRIDGE' }),
      makeEvent('TOSS', 2, { servings: 4 }),
    ]),
    finishedOf([makeEvent('EAT', 2, { servings: 1 })]),
    finishedOf([
      makeEvent('FRIDGE', 1, { servings: 6, place: 'FRIDGE' }),
      makeEvent('EAT', 2, { servings: 3 }),
      makeEvent('CLEAR', 3, { servings: 3 }),
    ]),
    finishedOf([
      makeEvent('FREEZE', 1, { servings: 3, place: 'FREEZER' }),
      makeEvent('CLEAR', 2, { servings: 3 }),
    ]),
  ],
  [
    'Tossed 1 of 4',
    'Ate 4 servings',
    'Tossed 4 servings',
    'Ate it all',
    'Cleared out 3 of 6',
    'Cleared out 3 servings',
  ],
  'a finished container says how much it ended with and how much went in, not the other way round',
);

const usedByContainers = getRecipeUsage([], 'adobo', 0, 2);
assert.deepEqual(
  [
    isInUse(getRecipeUsage([], 'adobo', 0, 0)),
    isInUse(usedByContainers),
    describeUsage(usedByContainers),
    describeUsage(getRecipeUsage([], 'adobo', 3, 1)),
  ],
  [
    false,
    true,
    '2 boxes in your fridge or freezer',
    '3 planned meals and 1 box in your fridge or freezer',
  ],
  'a recipe whose only use is food in the fridge or freezer is archived, not erased',
);

const rulesText = readFileSync('firestore.rules', 'utf8');
assert.ok(
  rulesText.includes(
    `isShortText(data.title, ${MAX_CONTAINER_TITLE_LENGTH})`,
  ) &&
    rulesText.includes(
      `e.kind.matches('${CONTAINER_EVENT_KINDS.join('|')}')`,
    ) &&
    rulesText.includes(`n <= ${MAX_CONTAINER_HISTORY}`) &&
    rulesText.includes(`data.servings <= ${MAX_CONTAINER_SERVINGS}`) &&
    rulesText.includes(`data.eatBy >= ${MIN_EAT_BY_DATE}`) &&
    rulesText.includes(`data.eatBy <= ${MAX_EAT_BY_DATE}`) &&
    rulesText.includes(`e.note.size() <= ${MAX_CONTAINER_NOTE_LENGTH}`) &&
    rulesText.includes(`e.servings < ${MAX_CONTAINER_SERVINGS + 1}`) &&
    Array.from({ length: MAX_CONTAINER_HISTORY }).every((_, index) =>
      rulesText.includes(`isContainerEvent(history[${index}])`),
    ) &&
    !rulesText.includes(`isContainerEvent(history[${MAX_CONTAINER_HISTORY}])`),
  "the rules' title length, event kinds, history cap, servings and eat-by bounds and note length match the constants, and every slot up to the cap is checked",
);

const stocked = [
  container({ id: 'a', servings: 2, place: 'FRIDGE', eatBy: dayOf(15) }),
  container({ id: 'b', servings: 3, place: 'FREEZER', eatBy: dayOf(60) }),
  container({ id: 'c', servings: 1, place: 'FREEZER', eatBy: dayOf(12) }),
  container({
    id: 'd',
    recipeId: null,
    mealId: 'meal-1',
    servings: 2,
    eatBy: dayOf(16),
  }),
  container({ id: 'e', recipeId: 'rice', servings: 5, status: 'DONE' }),
  container({ id: 'f', recipeId: null, mealId: null, servings: 4 }),
];
const maps = getStockMaps(stocked);
assert.deepEqual(
  maps.byRecipe.get('adobo'),
  {
    fridge: 2,
    freezer: 4,
    containers: 3,
    nearestEatBy: dayOf(12),
    fridgeEatBy: dayOf(15),
    freezerEatBy: dayOf(12),
  },
  'one pass sums a recipe across containers and places and keeps its nearest eat-by, overall and in each place',
);
assert.equal(
  maps.byRecipe.has('rice'),
  false,
  'a finished container is not stock',
);
assert.deepEqual(
  maps.byMeal.get('meal-1'),
  {
    fridge: 2,
    freezer: 0,
    containers: 1,
    nearestEatBy: dayOf(16),
    fridgeEatBy: dayOf(16),
    freezerEatBy: null,
  },
  'a saved meal has its own stock',
);
assert.equal(
  maps.byRecipe.size + maps.byMeal.size,
  2,
  'a typed container belongs to no recipe or meal',
);
const adoboStock = maps.byRecipe.get('adobo')!;
assert.deepEqual(
  getStockParts(adoboStock, lateOnThe14th),
  [
    {
      place: 'FRIDGE',
      servings: 2,
      due: { state: 'SOON', label: 'Eat by tomorrow' },
    },
    {
      place: 'FREEZER',
      servings: 4,
      due: { state: 'PAST', label: 'Past its date' },
    },
  ],
  'fridge first, then freezer, each only above zero, each with the eat-by of its own place',
);
assert.deepEqual(
  getStockParts(
    {
      fridge: 0,
      freezer: 3,
      containers: 1,
      nearestEatBy: dayOf(30),
      fridgeEatBy: null,
      freezerEatBy: dayOf(30),
    },
    lateOnThe14th,
  ),
  [{ place: 'FREEZER', servings: 3, due: null }],
  'a far eat-by adds nothing to its place',
);
assert.deepEqual(
  [
    getStockTitle(adoboStock),
    getStockTitle({ ...adoboStock, fridge: 0 }),
    getStockTitle({ ...adoboStock, freezer: 0 }),
  ],
  ['In your fridge and freezer', 'In your freezer', 'In your fridge'],
);
assert.equal(
  getStockDetail(
    { ...adoboStock, fridge: 0, nearestEatBy: dayOf(15) },
    lateOnThe14th,
  ),
  '4 servings, eat by tomorrow',
);
assert.equal(
  getStockDetail({ ...adoboStock, nearestEatBy: dayOf(15) }, lateOnThe14th),
  '2 servings in the fridge, 4 in the freezer, eat by tomorrow',
);
assert.deepEqual(
  getStockPlaceCounts(['adobo', 'rice', 'nope'], maps.byRecipe),
  { FRIDGE: 1, FREEZER: 1 },
  'the filter counts recipes with stock in each place, not servings',
);

const summary = getPreparedSummary(stocked, lateOnThe14th);
assert.deepEqual(
  summary,
  {
    fridgeServings: 2 + 2 + 4,
    freezerServings: 3 + 1,
    containerCount: 5,
    soonCount: 1,
    pastCount: 1,
  },
  'the Kitchen row counts servings by place, containers, those due by tomorrow (not the one due in two days) and those past their date; finished ones are left out',
);
assert.equal(
  getPlacesText(summary),
  '8 servings in the fridge, 4 in the freezer',
  'the word servings appears once',
);
assert.equal(
  getPlacesText({ fridgeServings: 0, freezerServings: 1 }),
  '1 serving in the freezer',
);
assert.deepEqual(
  [getDueText(2, 1), getDueText(1, 0), getDueText(0, 2), getDueText(0, 0)],
  [
    '2 to eat by tomorrow, 1 past its date',
    '1 to eat by tomorrow',
    '2 past their date',
    '',
  ],
);

assert.deepEqual(
  [
    isBulkMeal({ servings: 4, care: null, hasStock: false }),
    isBulkMeal({ servings: 5, care: null, hasStock: false }),
    isBulkMeal({ servings: 2, care: careOf(3, 90), hasStock: false }),
    isBulkMeal({ servings: 2, care: careOf(3, null), hasStock: false }),
    isBulkMeal({ servings: 2, care: null, hasStock: true }),
  ],
  [false, true, true, false, true],
  'a bulk meal is five or more servings, a recipe that says it freezes, or one already put away; fridge time alone is not a signal',
);
assert.deepEqual(
  [6, 4, 0, 1, -1.5, 498, 5.5].map(getPutAwayServings),
  [6, 4, 1, 1, 1, 100, 5],
  'what is left, as whole portions, at least one and at most 100',
);
assert.deepEqual(
  [
    getPutAwayBasis({ made: 8, eatenTonight: 2, saved: 0 }),
    getPutAwayBasis({ made: 8, eatenTonight: 2, saved: 6 }),
    getPutAwayBasis({ made: 8, eatenTonight: null, saved: 0 }),
    getPutAwayBasis({ made: 2, eatenTonight: 2, saved: 0 }),
  ],
  [
    "6 left after the 2 you're eating tonight",
    "0 left after the 2 you're eating tonight and the 6 already put away".replace(
      '0 left',
      'Nothing left',
    ),
    '6 left after about 2 for tonight',
    "Nothing left after the 2 you're eating tonight",
  ],
  'the details say how the default is worked out, counting what this cook already put away',
);
assert.deepEqual(
  [
    splitServings(8, 1),
    splitServings(8, 4),
    splitServings(7, 3),
    splitServings(8, 3),
    splitServings(5, 5),
  ],
  [[8], [2, 2, 2, 2], [3, 2, 2], [3, 3, 2], [1, 1, 1, 1, 1]],
  'servings split evenly, the extra ones going one each to the first containers',
);
assert.deepEqual(
  [
    getSplitText(8, 1),
    getSplitText(8, 4),
    getSplitText(7, 3),
    getSplitText(8, 3),
    getContainerCountMax(1),
    getContainerCountMax(8),
    getContainerCountMax(60),
  ],
  [
    null,
    '2 servings in each',
    '3 servings in the first, 2 in each of the others',
    '3 servings in each of the first 2, 2 in the other',
    1,
    8,
    MAX_CONTAINERS_PER_PUT_AWAY,
  ],
  'the split reads in plain words, and a container needs a serving, up to 20 containers',
);
assert.deepEqual(
  [
    getNewContainersProblem([fromCook, fromCook, fromCook, fromCook], 496),
    getNewContainersProblem([fromCook, fromCook, fromCook, fromCook], 497),
    getNewContainersProblem([fromCook], 499),
    getNewContainersProblem([fromCook], 500),
  ].map((problem) => problem !== null),
  [false, true, false, true],
  'the soft cap counts containers: a batch has to fit under it',
);
assert.match(
  getNewContainersProblem([fromCook, fromCook], 499) ?? '',
  /pass the 500/,
  'a batch past the cap says how many you can keep',
);
assert.deepEqual(
  [
    getServingsToEat(container(), {
      items: [{ id: 'i', kind: 'RECIPE', refId: 'adobo', servings: 2 }],
    }),
    getServingsToEat(container(), {
      items: [{ id: 'i', kind: 'RECIPE', refId: 'adobo', servings: 1.5 }],
    }),
    getServingsToEat(container({ servings: 1 }), {
      items: [{ id: 'i', kind: 'RECIPE', refId: 'adobo', servings: 3 }],
    }),
    getServingsToEat(container(), {
      items: [
        { id: 'i', kind: 'RECIPE', refId: 'adobo', servings: 1 },
        { id: 'j', kind: 'RECIPE', refId: 'adobo', servings: 2 },
        { id: 'k', kind: 'RECIPE', refId: 'rice', servings: 9 },
      ],
    }),
    getServingsToEat(container({ recipeId: null, mealId: 'meal-1' }), {
      items: [],
    }),
  ],
  [2, 2, 1, 3, 1],
  'a planned meal eats its planned servings of the recipe, whole, never more than is left, and one plate of a saved meal',
);

const stockOf = (name: string, fridge: number, freezer: number) => ({
  name,
  summary: { fridge, freezer, containers: 1, nearestEatBy: null },
});
assert.deepEqual(
  [
    getShoppingStockLine([], false),
    getShoppingStockLine([stockOf('Adobo', 0, 3)], false),
    getShoppingStockLine([stockOf('Adobo', 2, 0)], true),
    getShoppingStockLine([stockOf('Adobo', 2, 3)], false),
    getShoppingStockLine([stockOf('Adobo', 1, 1)], true),
    getShoppingStockLine([stockOf('Adobo', 1, 0), stockOf('Rice', 0, 2)], true),
    getShoppingStockLine(
      ['Adobo', 'Rice', 'Chili', 'Soup', 'Stew'].map((name) =>
        stockOf(name, 1, 0),
      ),
      true,
    ),
  ],
  [
    null,
    'You already have 3 servings in the freezer.',
    'You already have Adobo: 2 servings in the fridge.',
    'You already have 2 servings in the fridge, 3 in the freezer.',
    'You already have Adobo: 1 serving in the fridge, 1 in the freezer.',
    'You already have servings of Adobo and Rice in your fridge or freezer.',
    'You already have servings of Adobo, Rice, Chili and 2 more in your fridge or freezer.',
  ],
  'the shopping sheet says what is already put away, in one line, and never subtracts it',
);
assert.equal(
  getSavedText(
    [{ servings: 4, place: 'FREEZER', eatBy: dayOf(16) }],
    lateOnThe14th,
  ),
  'Saved 4 servings in the freezer, eat by ' +
    getEatByPhrase(dayOf(16), lateOnThe14th),
);
assert.equal(
  getSavedText(
    [{ servings: 1, place: 'FRIDGE', eatBy: dayOf(15) }],
    lateOnThe14th,
  ),
  'Saved 1 serving in the fridge, eat by tomorrow',
);
assert.equal(
  getSavedText(
    splitServings(4, 4).map((servings) => ({
      servings,
      place: 'FREEZER' as const,
      eatBy: dayOf(15),
    })),
    lateOnThe14th,
  ),
  'Saved 4 boxes (4 servings) in the freezer, eat by tomorrow',
  'a put-away of several containers says how many and how many servings in all',
);
assert.deepEqual(
  [
    getSavedHeadline([{ servings: 1, place: 'FRIDGE' }]),
    getSavedHeadline(
      splitServings(6, 3).map((servings) => ({
        servings,
        place: 'FRIDGE' as const,
      })),
    ),
  ],
  ['Saved 1 serving in the fridge', 'Saved 3 boxes (6 servings) in the fridge'],
  'the Finish panel says what was saved and where, with the eat-by date on its own line',
);
assert.deepEqual(
  [
    DEFAULT_LIST_VIEW_OPTIONS.showStock,
    parseListViewOptions({
      showPrices: false,
      showMacros: true,
      basis: 'PER_100G',
    }),
    parseListViewOptions({ showStock: false })?.showStock,
    parseListViewOptions({ showStock: 'no' })?.showStock,
    parseListViewOptions(null),
  ],
  [
    true,
    {
      showPrices: false,
      showMacros: true,
      basis: 'PER_100G',
      showStock: true,
      showStats: false,
    },
    false,
    true,
    null,
  ],
  'stock lines start shown, and a choice stored before the option existed reads as shown',
);
assert.deepEqual(
  [
    DEFAULT_LIST_VIEW_OPTIONS.showStats,
    parseListViewOptions({ showPrices: true })?.showStats,
    parseListViewOptions({ showStats: true })?.showStats,
    parseListViewOptions({ showStats: 'on' })?.showStats,
    parseListViewOptions({ showAverages: true })?.showStats,
    parseListViewOptions({ showAverages: true, showStats: true })?.showStats,
    'showAverages' in (parseListViewOptions({ showAverages: true }) ?? {}),
    countCustomizedViewOptions(DEFAULT_LIST_VIEW_OPTIONS, 'calendar'),
    countCustomizedViewOptions(
      { ...DEFAULT_LIST_VIEW_OPTIONS, showStats: true },
      'calendar',
    ),
    countCustomizedViewOptions(
      { ...DEFAULT_LIST_VIEW_OPTIONS, showStats: true },
      'recipes',
    ),
  ],
  [false, false, true, false, false, true, false, 0, 1, 0],
  "the Calendar's stats start off, a choice stored before the switch existed or a non-boolean reads as off, the old averages choice neither turns them on nor survives a write, and turning them on counts as a change on the Calendar only",
);
assert.deepEqual(
  [
    countCustomizedViewOptions(DEFAULT_LIST_VIEW_OPTIONS, 'recipes'),
    countCustomizedViewOptions(
      { ...DEFAULT_LIST_VIEW_OPTIONS, showStock: false },
      'recipes',
    ),
    countCustomizedViewOptions(
      { ...DEFAULT_LIST_VIEW_OPTIONS, showStock: false },
      'ingredients',
    ),
  ],
  [0, 1, 0],
  'hiding stock lines counts as a change on Recipes and Meals only',
);
assert.deepEqual(
  groupSavedBatches([
    container({ id: 'x1', createdAt: 5, place: 'FREEZER', eatBy: dayOf(30) }),
    container({ id: 'x2', createdAt: 5, place: 'FREEZER', eatBy: dayOf(30) }),
    container({ id: 'y1', createdAt: 9, place: 'FREEZER', eatBy: dayOf(30) }),
  ]).map((batch) => batch.map((entry) => entry.id)),
  [['x1', 'x2'], ['y1']],
  'one put-away is one line, a later one is its own',
);

assert.deepEqual(
  [
    getContainerTitle(
      container(),
      new Map([['adobo', { title: 'Adobo, renamed' } as Recipe]]),
      new Map(),
    ),
    getContainerTitle(container(), new Map(), new Map()),
    getContainerTitle(
      container({ recipeId: null, mealId: 'm' }),
      new Map(),
      new Map([['m', { name: 'Taco night' } as never]]),
    ),
    getContainerTitle(container({ recipeId: null }), new Map(), new Map()),
  ],
  ['Adobo, renamed', 'Adobo chicken', 'Taco night', 'Adobo chicken'],
  "a container shows its recipe's or meal's current name, and keeps its own title when that is gone",
);
{
  const stockOf = (
    fridge: number,
    freezer: number,
    fridgeEatBy: number | null = null,
    freezerEatBy: number | null = null,
  ) => ({
    fridge,
    freezer,
    containers: 1,
    nearestEatBy: fridgeEatBy ?? freezerEatBy,
    fridgeEatBy,
    freezerEatBy,
  });
  const plate = (id: string, ...refs: [string, 'RECIPE' | 'INGREDIENT'][]) => ({
    id,
    items: refs.map(([refId, kind], index) => ({
      id: `${id}-${index}`,
      kind,
      refId,
      servings: 2,
    })),
  });
  const rollUp = (
    meals: ReturnType<typeof plate>[],
    byRecipe: [string, ReturnType<typeof stockOf>][],
    byMeal: [string, ReturnType<typeof stockOf>][] = [],
  ) => getMealStockMap(meals, new Map(byRecipe), new Map(byMeal));
  const adoboAndRice = plate('meal-1', ['adobo', 'RECIPE'], ['rice', 'RECIPE']);

  assert.deepEqual(
    rollUp(
      [adoboAndRice],
      [
        ['adobo', stockOf(5, 0, dayOf(15))],
        ['rice', stockOf(3, 0, dayOf(12))],
      ],
      [['meal-1', stockOf(2, 0, dayOf(16))]],
    ).get('meal-1'),
    { fridge: 5, freezer: 0, fridgeEatBy: dayOf(12), freezerEatBy: null },
    'two dishes with 5 and 3 in the fridge plus 2 boxed as the plate are 5 whole plates, not 10, and the date is the nearest of what makes them',
  );
  assert.deepEqual(
    rollUp(
      [adoboAndRice],
      [
        ['adobo', stockOf(5, 5, dayOf(15), dayOf(60))],
        ['rice', stockOf(3, 0, dayOf(12))],
      ],
      [['meal-1', stockOf(2, 0, dayOf(16))]],
    ).get('meal-1'),
    { fridge: 5, freezer: 0, fridgeEatBy: dayOf(12), freezerEatBy: null },
    'a place counts its own dishes: adobo in the freezer with no rice there is no plate in the freezer, and its date never reaches the fridge row',
  );
  assert.deepEqual(
    [
      rollUp([adoboAndRice], [['adobo', stockOf(5, 0, dayOf(12))]]).has(
        'meal-1',
      ),
      rollUp(
        [adoboAndRice],
        [['adobo', stockOf(5, 0, dayOf(12))]],
        [['meal-1', stockOf(2, 0, dayOf(16))]],
      ).get('meal-1'),
    ],
    [
      false,
      { fridge: 2, freezer: 0, fridgeEatBy: dayOf(16), freezerEatBy: null },
    ],
    'a plate with one dish missing makes nothing from its dishes: with no plate boxes it has no stock, and a lone dish never sets the date of the boxed plates',
  );
  assert.deepEqual(
    rollUp(
      [adoboAndRice],
      [
        ['adobo', stockOf(0, 4, null, dayOf(40))],
        ['rice', stockOf(0, 6, null, dayOf(30))],
      ],
    ).get('meal-1'),
    { fridge: 0, freezer: 4, fridgeEatBy: null, freezerEatBy: dayOf(30) },
    'the freezer is counted on its own, as the dish with the least in it',
  );
  assert.deepEqual(
    [
      rollUp(
        [
          plate(
            'm',
            ['adobo', 'RECIPE'],
            ['adobo', 'RECIPE'],
            ['rice', 'INGREDIENT'],
          ),
        ],
        [['adobo', stockOf(4, 0, dayOf(12))]],
      ).get('m')?.fridge,
      rollUp(
        [plate('m', ['rice', 'INGREDIENT'])],
        [['rice', stockOf(9, 0)]],
      ).has('m'),
      rollUp(
        [plate('m', ['rice', 'INGREDIENT'])],
        [],
        [['m', stockOf(3, 0, dayOf(12))]],
      ).get('m')?.fridge,
    ],
    [4, false, 3],
    'a recipe listed twice is one dish, an ingredient is no dish and no stock, and a plate of ingredients has only the boxes put away as that plate',
  );

  const rolledMeals = rollUp(
    [
      adoboAndRice,
      plate('meal-partial', ['adobo', 'RECIPE'], ['pho', 'RECIPE']),
      plate('meal-freezer', ['rice', 'RECIPE']),
    ],
    [
      ['adobo', stockOf(5, 0, dayOf(18))],
      ['rice', stockOf(3, 2, dayOf(15), dayOf(60))],
    ],
    [['meal-1', stockOf(2, 0, dayOf(16))]],
  );
  assert.deepEqual(
    [
      getStockPlaceCounts(
        ['meal-1', 'meal-partial', 'meal-freezer', 'nope'],
        rolledMeals,
      ),
      ['meal-1', 'meal-partial', 'meal-freezer'].map((id) =>
        hasStockIn(rolledMeals.get(id), 'FRIDGE'),
      ),
      getStockParts(rolledMeals.get('meal-1')!, lateOnThe14th),
    ],
    [
      { FRIDGE: 2, FREEZER: 1 },
      [true, false, true],
      [
        {
          place: 'FRIDGE',
          servings: 5,
          due: { state: 'SOON', label: 'Eat by tomorrow' },
        },
      ],
    ],
    "the Saved meals filter and its counts, and a meal's rows and badge, read whole plates: a meal with a dish missing is not in the fridge, and a row only appears for a place that has a plate",
  );
  assert.deepEqual(
    [
      formatStockAmount(1, 'recipe'),
      formatStockAmount(5, 'recipe'),
      formatStockAmount(1, 'meal'),
      formatStockAmount(5, 'meal'),
    ],
    ['1 serving', '5 servings', '1 plate', '5 plates'],
    "a recipe's stock counts servings and a saved meal's counts plates",
  );
}

const byCook = groupContainersByCook([
  container({
    id: 'a',
    cookId: 'k1',
    servings: 4,
    history: [
      makeEvent('MADE', 1, { servings: 8 }),
      makeEvent('FRIDGE', 1, { servings: 4, place: 'FRIDGE' }),
    ],
  }),
  container({
    id: 'b',
    cookId: 'k1',
    servings: 2,
    history: [makeEvent('FREEZE', 2, { servings: 2, place: 'FREEZER' })],
  }),
  container({ id: 'c', cookId: null }),
]);
assert.deepEqual(
  [
    byCook.size,
    byCook.get('k1')?.length,
    getPutAwayText(byCook.get('k1') ?? []),
  ],
  [1, 2, 'Put away 6 servings'],
  'a cook says how many servings were put away across its containers, not how many it made',
);
assert.equal(getPutAwayText([]), null);

// ---------------------------------------------------------------------------
// The calendar's summary line and Week summary
// ---------------------------------------------------------------------------
{
  const {
    getCostAverages,
    getDayCostText,
    getPeriodCostText,
    getPeriodCostTile,
    getPricedCoverage,
    formatPeriodCost,
  } = await import('../../src/apps/pinch/utils/stats.ts');
  const { getDateOfDayKey } =
    await import('../../src/apps/pinch/utils/dayKeys.ts');

  const gapA: Gap = { kind: 'NO_PRODUCT', ingredientId: 'a' };
  assert.deepEqual(
    [
      getPeriodCostText(
        { spendCents: 410, mealsPriced: 3, leftOut: [], openLeftOut: [] },
        false,
      ),
      getPeriodCostText(
        {
          spendCents: 410,
          mealsPriced: 3,
          leftOut: [gapA],
          openLeftOut: [gapA],
        },
        false,
      ),
      getPeriodCostText(
        { spendCents: 0, mealsPriced: 0, leftOut: [], openLeftOut: [] },
        false,
      ),
      getPeriodCostText(
        { spendCents: 0, mealsPriced: 0, leftOut: [], openLeftOut: [] },
        true,
      ),
      getPeriodCostText(
        { spendCents: 789_450, mealsPriced: 300, leftOut: [], openLeftOut: [] },
        false,
      ),
    ],
    ['$4.10', '$4.10 so far', 'No price yet', 'Not priced', '$7,895'],
    'a period reads its figure, "so far" while something is left out, and the shared words for nothing priced',
  );
  assert.equal(
    getPeriodCostText(
      { spendCents: 410, mealsPriced: 3, leftOut: [gapA], openLeftOut: [] },
      true,
    ),
    '$4.10+',
    'a period whose every gap is on a fixed day says + like its day rows, never "so far"',
  );

  const costCases: [Parameters<typeof getPeriodCostTile>[0], string][] = [
    [
      { spendCents: 410, mealsPriced: 3, leftOut: [], openLeftOut: [] },
      'whole',
    ],
    [
      { spendCents: 410, mealsPriced: 3, leftOut: [gapA], openLeftOut: [gapA] },
      'open',
    ],
    [
      { spendCents: 410, mealsPriced: 3, leftOut: [gapA], openLeftOut: [] },
      'fixed',
    ],
    [
      {
        spendCents: 789_450,
        mealsPriced: 300,
        leftOut: [gapA],
        openLeftOut: [gapA],
      },
      'big',
    ],
  ];
  assert.deepEqual(
    costCases.map(([stats]) => getPeriodCostTile(stats)),
    [
      { value: '$4.10', label: 'Total' },
      { value: '$4.10', label: 'Total so far' },
      { value: '$4.10+', label: 'Total' },
      { value: '$7,895', label: 'Total so far' },
    ],
    'the Total tile puts "so far" in its caption and "+" on its figure, and a big total drops its cents',
  );
  assert.deepEqual(
    costCases.map(([stats]) => {
      const tile = getPeriodCostTile(stats);
      return tile === null
        ? null
        : tile.label === 'Total so far'
          ? `${tile.value} so far`
          : tile.value;
    }),
    costCases.map(([stats]) => getPeriodCostText(stats, false)),
    'the Total tile and the summary line read one figure, so the tile row can take the total over from the line without the two ever disagreeing',
  );
  assert.equal(
    getPeriodCostTile({
      spendCents: 0,
      mealsPriced: 0,
      leftOut: [],
      openLeftOut: [],
    }),
    null,
    'with nothing priced there is no Total tile, and the summary line keeps saying "No price yet"',
  );

  const averagesOf = (
    patch: Partial<Parameters<typeof getCostAverages>[0]>,
    isProteinOn = false,
  ) =>
    getCostAverages(
      {
        fullyPricedMeals: 3,
        avgPerFullyPricedMealCents: 29.6,
        proteinPricedMeals: 3,
        proteinCentsPerGram: 1.2,
        ...patch,
      },
      isProteinOn,
    ).map((average) => `${average.label} ${average.value}`);
  assert.deepEqual(
    [
      averagesOf({}),
      averagesOf({}, true),
      averagesOf({ proteinCentsPerGram: null }, true),
    ],
    [
      ['Avg per fully priced meal $0.30'],
      ['Avg per fully priced meal $0.30', 'Per g protein, fully priced $0.01'],
      ['Avg per fully priced meal $0.30'],
    ],
    'the averages name their base, fully priced meals, and carry no "so far" or "+" since nothing in that base is left out; the price per gram of protein shows only while protein is on and known',
  );
  assert.deepEqual(
    [
      averagesOf({ fullyPricedMeals: 2 }),
      averagesOf({ fullyPricedMeals: 3 }),
      averagesOf({ fullyPricedMeals: 0, avgPerFullyPricedMealCents: null }),
      averagesOf({ fullyPricedMeals: 9, proteinPricedMeals: 2 }, true),
      averagesOf({ fullyPricedMeals: 9, proteinPricedMeals: 3 }, true),
    ],
    [
      [],
      ['Avg per fully priced meal $0.30'],
      [],
      ['Avg per fully priced meal $0.30'],
      ['Avg per fully priced meal $0.30', 'Per g protein, fully priced $0.01'],
    ],
    'an average needs three fully priced meals behind it and says nothing under that, the price per gram of protein counting its own meals',
  );

  const { getPeriodStats: getStatsOf, getPeriodTotal } =
    await import('../../src/apps/pinch/utils/stats.ts');
  const { buildSnapshot: buildStatsSnapshot } =
    await import('../../src/apps/pinch/utils/mealMath.ts');
  const statsContext = repriceContext(
    [],
    ['a', 'b', 'c'].map(repriceIngredient),
    [product('a', 500, 1000, 'G'), product('b', 1000, 1000, 'G')],
  );
  const statsItem = (id: string, refId: string, servings = 1): MealItem => ({
    id,
    kind: refId === 'gone' ? 'RECIPE' : 'INGREDIENT',
    refId,
    servings,
  });
  const statsMeal = (
    id: string,
    items: MealItem[],
    snapshot: PlannedSnapshot | null = null,
  ) =>
    ({
      ...plannedOf(items, snapshot),
      id,
      date: getDateOfDayKey('2026-10-16'),
    }) as PlannedMeal;
  const statsRange = { startKey: '2026-10-15', endKey: '2026-10-21' };
  const partialStats = getStatsOf(
    [
      statsMeal('f1', [statsItem('i', 'a')]),
      statsMeal('f2', [statsItem('i', 'b')]),
      statsMeal('f3', [statsItem('i', 'a', 2)]),
      statsMeal('p1', [statsItem('i', 'a'), statsItem('j', 'c')]),
      statsMeal('n1', [statsItem('i', 'c')]),
      statsMeal('p2', [statsItem('i', 'a'), statsItem('j', 'gone')]),
      statsMeal(
        'z1',
        [statsItem('i', 'b', 3)],
        buildStatsSnapshot([statsItem('i', 'b', 3)], statsContext, 1000),
      ),
      statsMeal(
        'z2',
        [statsItem('i', 'a'), statsItem('j', 'c')],
        buildStatsSnapshot(
          [statsItem('i', 'a'), statsItem('j', 'c')],
          statsContext,
          1000,
        ),
      ),
    ],
    statsRange,
    statsContext,
  );
  assert.deepEqual(
    [
      partialStats.plannedCount,
      partialStats.mealsPriced,
      partialStats.fullyPricedMeals,
      partialStats.avgPerFullyPricedMealCents,
    ],
    [8, 7, 4, (50 + 100 + 100 + 300) / 4],
    'the average divides the cost of the fully priced meals alone by their count: a meal with a gap, a frozen one with a gap, one with an item that has no cost and a meal with no price never pull it down',
  );
  assert.ok(
    partialStats.spendCents / partialStats.mealsPriced <
      (partialStats.avgPerFullyPricedMealCents ?? 0),
    'the old average over every meal with any price comes out lower, because each meal with a gap adds only a floor',
  );
  assert.deepEqual(
    [partialStats.proteinPricedMeals, partialStats.proteinCentsPerGram],
    [4, (50 + 100 + 100 + 300) / (20 + 20 + 40 + 60)],
    'the price per gram of protein spends only what the fully priced meals cost over only their protein, never the grams of a meal whose price is a floor',
  );
  assert.deepEqual(
    getStatsOf([], statsRange, statsContext).avgPerFullyPricedMealCents,
    null,
    'an empty period has no average',
  );
  assert.deepEqual(
    [
      getPeriodTotal(partialStats, false),
      getPeriodTotal(
        getStatsOf(
          [statsMeal('n1', [statsItem('i', 'c')])],
          statsRange,
          statsContext,
        ),
        false,
      ),
      getPeriodTotal(
        getStatsOf(
          [statsMeal('n1', [statsItem('i', 'c')])],
          statsRange,
          statsContext,
        ),
        true,
      ),
    ],
    [
      { value: '$7.00', label: 'Total so far' },
      { value: 'No price yet', label: 'Total' },
      { value: 'Not priced', label: 'Total' },
    ],
    'the summary sheet names its total as the front tile does, "Total so far" over the figure, and says nothing-priced in the line\'s words under the same name',
  );
  assert.equal(
    formatPeriodCost(789_450),
    '$7,895',
    'the summary line and the sheet round a big total the same way',
  );
  assert.equal(formatPeriodCost(99_999), '$999.99');

  const { getDayStatsOffer, withWholeCalories } =
    await import('../../src/apps/pinch/utils/stats.ts');
  const { hasShownValue } =
    await import('../../src/apps/pinch/utils/nutritionMath.ts');
  const dayRange = { startKey: '2026-10-16', endKey: '2026-10-16' };
  const dayOf = (meals: PlannedMeal[]) =>
    getStatsOf(meals, dayRange, statsContext);
  const showOnly = (...metrics: string[]) => ({
    calories: metrics.includes('calories'),
    protein: metrics.includes('protein'),
    carbs: metrics.includes('carbs'),
    fat: metrics.includes('fat'),
  });
  const fullMeals = [
    statsMeal('f1', [statsItem('i', 'a')]),
    statsMeal('f2', [statsItem('i', 'b')]),
    statsMeal('f3', [statsItem('i', 'a', 2)]),
  ];
  const threeFullDay = dayOf(fullMeals);
  const twoFullDay = dayOf(fullMeals.slice(0, 2));
  const unpricedDay = dayOf([statsMeal('n1', [statsItem('i', 'c')])]);
  const unknownDay = dayOf([statsMeal('g1', [statsItem('i', 'gone')])]);
  const frozenItems = [statsItem('i', 'a'), statsItem('j', 'c')];
  const frozenDay = dayOf([
    statsMeal(
      'z2',
      frozenItems,
      buildStatsSnapshot(frozenItems, statsContext, 1000),
    ),
  ]);
  assert.deepEqual(
    [
      getPeriodTotal(threeFullDay, false),
      getCostAverages(threeFullDay, true).map(
        (average) => `${average.label} ${average.value}`,
      ),
    ],
    [
      { value: '$2.50', label: 'Total' },
      ['Avg per fully priced meal $0.83', 'Per g protein, fully priced $0.03'],
    ],
    "a day reads its tiles through the week's own functions: three fully priced meals give a Total, an average over those meals and, with protein on, the price per gram",
  );
  assert.deepEqual(
    [
      getCostAverages(twoFullDay, true),
      getDayStatsOffer(twoFullDay, showOnly()),
    ],
    [[], null],
    'two fully priced meals are under the floor of three, so a day shows no average, and with no nutrition on it has nothing to offer beyond its Total',
  );
  assert.deepEqual(
    [
      getDayStatsOffer(threeFullDay, showOnly('calories', 'protein')),
      getDayStatsOffer(threeFullDay, showOnly()),
      getDayStatsOffer(twoFullDay, showOnly('calories', 'protein')),
      getDayStatsOffer(twoFullDay, showOnly('carbs')),
      getDayStatsOffer(
        twoFullDay,
        showOnly('calories', 'protein', 'carbs', 'fat'),
      ),
      getDayStatsOffer(unpricedDay, showOnly('fat')),
    ],
    [
      { subtitle: 'Cost averages' },
      { subtitle: 'Cost averages' },
      null,
      null,
      null,
      null,
    ],
    'the stats row names only the cost averages: the Total and the nutrition switched on are on the drawer\'s front, so a day with nutrition on and under three fully priced meals reports no extra row, and with the averages it says "Cost averages" whatever is switched on',
  );
  const nutritionFront = (day: typeof twoFullDay, ...metrics: string[]) =>
    hasShownValue(withWholeCalories(day.dailyNutrition), showOnly(...metrics));
  assert.deepEqual(
    [
      nutritionFront(twoFullDay, 'calories', 'protein'),
      nutritionFront(twoFullDay, 'carbs'),
      nutritionFront(twoFullDay),
      nutritionFront(unknownDay, 'calories', 'protein'),
      nutritionFront(unpricedDay, 'fat'),
    ],
    [true, true, false, false, true],
    "a day's front draws its nutrition tiles for the metrics switched on that the day knows, and none with every switch off or nothing known; a day with nothing priced still has its nutrition to show",
  );
  assert.deepEqual(
    [
      getDayStatsOffer(
        {
          fullyPricedMeals: 3,
          avgPerFullyPricedMealCents: 29.6,
          proteinPricedMeals: 0,
          proteinCentsPerGram: null,
        },
        showOnly('protein'),
      ),
      getDayStatsOffer(
        {
          fullyPricedMeals: 2,
          avgPerFullyPricedMealCents: 29.6,
          proteinPricedMeals: 2,
          proteinCentsPerGram: 1.2,
        },
        showOnly('protein'),
      ),
      getDayStatsOffer(
        {
          fullyPricedMeals: 3,
          avgPerFullyPricedMealCents: null,
          proteinPricedMeals: 3,
          proteinCentsPerGram: 1.2,
        },
        showOnly('calories'),
      ),
    ],
    [{ subtitle: 'Cost averages' }, null, null],
    "the offer follows the averages' own rules: three fully priced meals with a figure, and nothing under that or without the figure, whether or not protein is on",
  );
  assert.deepEqual(
    [
      getDayStatsOffer(unknownDay, showOnly('calories', 'protein')),
      getDayStatsOffer(unpricedDay, showOnly()),
    ],
    [null, null],
    'a day with nothing to average has no row, so none opens a view with nothing in it',
  );
  assert.deepEqual(
    [
      getPeriodTotal(unpricedDay, false).value,
      getPeriodTotal(unpricedDay, true).value,
      getPeriodTotal(frozenDay, true).value,
    ],
    [
      getDayCostText(unpricedDay.byDay[0], false),
      getDayCostText(unpricedDay.byDay[0], true),
      getDayCostText(frozenDay.byDay[0], true),
    ],
    'a day with nothing priced, a passed day with nothing priced and a fixed day with a gap read in the drawer exactly as their row in the week reads',
  );
  assert.equal(
    getPeriodTotal(frozenDay, true).label,
    'Total',
    'a day whose every gap is on a fixed day says + on its figure and never "so far" in its caption',
  );

  const weekMeals = [
    ['2026-10-15', 'f1', [statsItem('i', 'a')]],
    ['2026-10-15', 'p1', [statsItem('i', 'a'), statsItem('j', 'c')]],
    ['2026-10-16', 'f2', [statsItem('i', 'b')]],
    ['2026-10-17', 'n1', [statsItem('i', 'c')]],
    ['2026-10-18', 'f3', [statsItem('i', 'a', 2)]],
    ['2026-10-18', 'f4', [statsItem('i', 'b', 2)]],
  ].map(
    ([dayKey, id, items]) =>
      ({
        ...statsMeal(id as string, items as MealItem[]),
        date: getDateOfDayKey(dayKey as string),
      }) as PlannedMeal,
  );
  const week = getStatsOf(weekMeals, statsRange, statsContext);
  assert.deepEqual(
    week.byDay.map((entry) => {
      const day = getStatsOf(
        weekMeals,
        { startKey: entry.dayKey, endKey: entry.dayKey },
        statsContext,
      );
      return [
        day.spendCents,
        getPeriodTotal(day, false).value.replace(/\+$/, ''),
      ];
    }),
    week.byDay.map((entry) => [
      entry.totalCents ?? 0,
      getDayCostText(entry, false).replace(/\+$/, ''),
    ]),
    "each day's figure in its drawer is the figure its row shows in the week summary, from one walk or from a walk of the day alone",
  );
  const bigDayGap: Gap = { kind: 'NO_PRODUCT', ingredientId: 'a' };
  assert.deepEqual(
    [99_999, 100_000, 123_456].map((cents) => [
      getPeriodTotal(
        { spendCents: cents, mealsPriced: 3, leftOut: [], openLeftOut: [] },
        false,
      ).value,
      getDayCostText({ totalCents: cents, leftOut: [] }, false),
    ]),
    [
      ['$999.99', '$999.99'],
      ['$1,000', '$1,000'],
      ['$1,235', '$1,235'],
    ],
    'a day of $1,000 or more reads one figure in its drawer tile and in its row of the week summary: both drop the cents from $1,000 up',
  );
  assert.deepEqual(
    [
      getPeriodTotal(
        {
          spendCents: 123_456,
          mealsPriced: 3,
          leftOut: [bigDayGap],
          openLeftOut: [bigDayGap],
        },
        false,
      ),
      getPeriodTotal(
        {
          spendCents: 123_456,
          mealsPriced: 3,
          leftOut: [bigDayGap],
          openLeftOut: [],
        },
        true,
      ),
      getDayCostText({ totalCents: 123_456, leftOut: [bigDayGap] }, false),
    ],
    [
      { value: '$1,235', label: 'Total so far' },
      { value: '$1,235+', label: 'Total' },
      '$1,235+',
    ],
    'a big day with something left out says so the same way in its tile and its row: the figure from $1,000 up without cents, "+" or "so far" after it',
  );
  assert.deepEqual(
    [
      getDayCostText({ totalCents: 8, leftOut: [] }, false),
      getDayCostText(
        { totalCents: 8, leftOut: [{ kind: 'NO_PRODUCT', ingredientId: 'a' }] },
        false,
      ),
      getDayCostText({ totalCents: null, leftOut: [] }, false),
      getDayCostText({ totalCents: null, leftOut: [] }, true),
    ],
    ['$0.08', '$0.08+', 'No price yet', 'Not priced'],
    'a day row says "+" when it leaves something out and "Not priced" once it has passed',
  );

  const coverageRecipe = {
    id: 'stew',
    title: 'Stew',
    servings: 4,
    ingredients: [
      { id: 'l1', ingredientId: 'beef', amount: 1, unit: 'LB', note: null },
      { id: 'l2', ingredientId: 'carrot', amount: 2, unit: 'EACH', note: null },
      { id: 'l3', ingredientId: 'salt', amount: 1, unit: 'TSP', note: null },
    ],
  } as unknown as Recipe;
  const coverageMeal = (id: string, dayKey: string, items: MealItem[]) =>
    ({
      ...plannedOf(items, null),
      id,
      date: getDateOfDayKey(dayKey),
    }) as PlannedMeal;
  const coverageMeals = [
    coverageMeal('m1', '2026-10-15', [
      { id: 'i1', kind: 'RECIPE', refId: 'stew', servings: 2 },
      { id: 'i2', kind: 'INGREDIENT', refId: 'bread', servings: 1 },
    ]),
    coverageMeal('m2', '2026-10-16', [
      { id: 'i3', kind: 'RECIPE', refId: 'stew', servings: 2 },
    ]),
    coverageMeal('m3', '2026-10-30', [
      { id: 'i4', kind: 'INGREDIENT', refId: 'cake', servings: 1 },
    ]),
  ];
  assert.deepEqual(
    getPricedCoverage(
      coverageMeals,
      { startKey: '2026-10-15', endKey: '2026-10-21' },
      new Map([['stew', coverageRecipe]]),
      [
        { kind: 'NO_PRODUCT', ingredientId: 'salt' },
        { kind: 'NOT_COMPARABLE', ingredientId: 'salt' },
        { kind: 'NO_PRODUCT', ingredientId: 'bread' },
      ],
    ),
    { usedCount: 4, pricedCount: 2 },
    'coverage counts each ingredient of the period once, from recipes and loose items alike, and leaves out days outside it',
  );
  assert.deepEqual(
    getPricedCoverage(
      coverageMeals,
      { startKey: '2026-10-15', endKey: '2026-10-21' },
      new Map(),
      [{ kind: 'NO_PRODUCT', ingredientId: 'beef' }],
    ),
    { usedCount: 2, pricedCount: 1 },
    'a removed recipe adds nothing, and a gap it left behind still counts as used and unpriced',
  );
}

{
  const {
    formatPeriodTitle,
    getEarlierThisWeekKeys,
    getPeriodRange,
    getVisibleRange,
    isRangeInWindow,
    shiftAnchor,
  } = await import('../../src/apps/pinch/utils/dayKeys.ts');

  assert.deepEqual(
    getPeriodRange('week', '2026-10-15', true),
    { startKey: '2026-10-15', endKey: '2026-10-21' },
    "a phone's week starts on today and runs seven days",
  );
  assert.deepEqual(
    getPeriodRange('week', '2026-10-15'),
    { startKey: '2026-10-11', endKey: '2026-10-17' },
    'a wide week still runs Sunday to Saturday',
  );
  assert.deepEqual(
    [
      getPeriodRange('week', '2026-10-28', true),
      getPeriodRange('week', '2026-12-29', true),
    ],
    [
      { startKey: '2026-10-28', endKey: '2026-11-03' },
      { startKey: '2026-12-29', endKey: '2027-01-04' },
    ],
    'a rolling week crosses a month and a year without losing a day',
  );
  assert.deepEqual(
    [
      getPeriodRange('week', '2026-10-29', true),
      getPeriodRange('week', '2026-09-24', true),
      getPeriodRange('week', '2026-04-02', true),
    ],
    [
      { startKey: '2026-10-29', endKey: '2026-11-04' },
      { startKey: '2026-09-24', endKey: '2026-09-30' },
      { startKey: '2026-04-02', endKey: '2026-04-08' },
    ],
    'weeks holding a clock change (Nov 1 in Los Angeles, Sep 27 and Apr 5 in Auckland) keep seven days',
  );
  assert.deepEqual(
    [
      shiftAnchor('week', '2026-10-15', 1),
      shiftAnchor('week', '2026-10-15', -1),
    ],
    ['2026-10-22', '2026-10-08'],
    'the arrows step a rolling week by seven days from wherever it starts',
  );
  assert.deepEqual(getVisibleRange('week', '2026-10-15', true), {
    startKey: '2026-10-15',
    endKey: '2026-10-21',
  });
  assert.deepEqual(
    [
      isRangeInWindow(getVisibleRange('week', '2026-12-29', true), '2026-10'),
      isRangeInWindow(getVisibleRange('week', '2026-12-25', true), '2026-10'),
    ],
    [false, true],
    'a rolling week that reaches past the loaded months moves the listener, one inside them does not',
  );
  assert.deepEqual(
    [
      formatPeriodTitle('week', '2026-10-15', '2026-10-15', true),
      formatPeriodTitle('week', '2026-10-29', '2026-10-15', true),
      formatPeriodTitle('week', '2026-12-29', '2026-10-15', true),
    ].map((title) => title.replace(/\s/g, ' ')),
    ['Oct 15 – 21', 'Oct 29 – Nov 4', 'Dec 29, 2026 – Jan 4, 2027'],
    "a rolling week's title names its own seven days",
  );
  assert.deepEqual(
    [
      getEarlierThisWeekKeys('2026-10-11'),
      getEarlierThisWeekKeys('2026-10-15'),
      getEarlierThisWeekKeys('2026-10-17'),
      getEarlierThisWeekKeys('2026-11-03'),
    ],
    [
      [],
      ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'],
      [
        '2026-10-11',
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
      ],
      ['2026-11-01', '2026-11-02'],
    ],
    "the days folded above today are this week's Sunday up to yesterday, none on a Sunday, across a clock change",
  );
}

// Plan builder: recent picks, the day strip and the default meal.
// ---------------------------------------------------------------------------
{
  const recentPicks = rankRecentPicks({
    recipes: [
      { id: 'old', title: 'Old soup', createdAt: 100 },
      { id: 'cooked', title: 'Cooked stew', createdAt: 110 },
      { id: 'planned', title: 'Planned tacos', createdAt: 120 },
      { id: 'new', title: 'New salad', createdAt: 900 },
    ],
    meals: [
      { id: 'm-used', name: 'Taco night', createdAt: 130 },
      { id: 'm-idle', name: 'Snack plate', createdAt: 140 },
    ],
    plannedMeals: [
      {
        createdAt: 700,
        sourceMealId: 'm-used',
        items: [
          { kind: 'RECIPE', refId: 'planned' },
          { kind: 'INGREDIENT', refId: 'old' },
        ],
      },
      {
        createdAt: 500,
        sourceMealId: null,
        items: [{ kind: 'RECIPE', refId: 'planned' }],
      },
    ],
    cookSummaries: new Map([['cooked', { lastCookedAt: 800 }]]),
  });
  assert.deepEqual(
    recentPicks.map((pick) => `${pick.kind}:${pick.id}`),
    [
      'RECIPE:new',
      'RECIPE:cooked',
      'RECIPE:planned',
      'MEAL:m-used',
      'MEAL:m-idle',
      'RECIPE:old',
    ],
    'recent picks rank by the latest of made, planned (the plan, not its day) and cooked; an ingredient with a recipe id never counts',
  );
  assert.deepEqual(
    rankRecentPicks({
      recipes: [
        { id: 'b', title: 'Beta', createdAt: 5 },
        { id: 'a', title: 'Alpha', createdAt: 5 },
      ],
      meals: [],
      plannedMeals: [],
      cookSummaries: new Map(),
    }).map((pick) => pick.label),
    ['Alpha', 'Beta'],
    'ties read alphabetically',
  );
}

{
  assert.deepEqual(
    getNearDayOptions('2026-10-15').map((option) => option.label),
    ['Today', 'Tomorrow', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'],
    'the day strip is today, tomorrow and the next five weekday names',
  );
  assert.deepEqual(
    getNearDayOptions('2026-12-30').map((option) => option.value),
    [
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04',
      '2027-01-05',
    ],
    'the day strip crosses a year in whole UTC days',
  );
  assert.deepEqual(
    getNearDayOptions('2026-11-01').map((option) => option.value),
    [
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ],
    'the day strip keeps whole days across a clock change',
  );
  assert.deepEqual(
    [
      getPlanDayWord('2026-10-15', '2026-10-15'),
      getPlanDayWord('2026-10-16', '2026-10-15'),
      getPlanDayWord('2026-10-21', '2026-10-15'),
      getPlanDayWord('2026-10-22', '2026-10-15'),
      getPlanDayWord('2026-10-12', '2026-10-15'),
    ],
    ['today', 'tomorrow', 'Wed', 'Thu, Oct 22', 'Mon, Oct 12'],
    'a plan names its day by the nearest word that cannot be mistaken',
  );
  assert.deepEqual(
    [
      getDefaultMealType([], true, 7),
      getDefaultMealType([], true, 10),
      getDefaultMealType([], true, 14),
      getDefaultMealType([], true, 15),
      getDefaultMealType([], false, 7),
    ],
    ['BREAKFAST', 'LUNCH', 'LUNCH', 'DINNER', 'DINNER'],
    'today follows the clock (before 10 breakfast, before 3 pm lunch, else dinner); any other day starts at dinner',
  );
  assert.deepEqual(
    [
      getDefaultMealType(['BREAKFAST'], true, 8),
      getDefaultMealType(['LUNCH'], true, 11),
      getDefaultMealType(['LUNCH', 'DINNER'], true, 11),
      getDefaultMealType(['DINNER'], false, 20),
      getDefaultMealType(['DINNER', 'LUNCH'], false, 20),
      getDefaultMealType(['DINNER', 'LUNCH', 'BREAKFAST'], false, 20),
      getDefaultMealType(['SNACK'], false, 20),
    ],
    ['LUNCH', 'DINNER', 'BREAKFAST', 'LUNCH', 'BREAKFAST', 'DINNER', 'DINNER'],
    'a meal the day already has moves the default to the nearest main meal it lacks, and a full day keeps the clock meal',
  );
}

// Plan builder: the When row, the footer's reason, and the recent rows kept beside the plate.
{
  const dinner = { label: 'Dinner', emoji: '🍝' };
  assert.deepEqual(
    [
      getWhenSummary('2026-10-15', '2026-10-15', dinner),
      getWhenSummary('2026-10-16', '2026-10-15', dinner),
      getWhenSummary('2026-10-24', '2026-10-15', dinner),
      getWhenSummary('2027-01-02', '2026-12-31', dinner),
    ].map((text) => text.replace(/\s/g, ' ')),
    [
      'Today · 🍝 Dinner',
      'Tomorrow · 🍝 Dinner',
      'Sat, Oct 24 · 🍝 Dinner',
      'Sat, Jan 2 · 🍝 Dinner',
    ],
    "the When row says today and tomorrow in words and any other day by its weekday and date, then the meal, counting whole UTC days across a year's end",
  );
  const noteOf = (
    mode: 'plan' | 'meal',
    hasName: boolean,
    hasDay: boolean,
    hasItems: boolean,
  ) => getBuilderNote({ mode, hasName, hasDay, hasItems });
  assert.deepEqual(
    [
      noteOf('plan', false, true, false),
      noteOf('plan', false, false, true),
      noteOf('plan', false, false, false),
      noteOf('plan', false, true, true),
      noteOf('meal', false, true, false),
      noteOf('meal', false, true, true),
      noteOf('meal', true, true, false),
      noteOf('meal', true, true, true),
    ],
    [
      'Add something for the plate',
      'Pick a day first',
      'Pick a day and add something for the plate',
      null,
      'Add a name and something for the plate',
      'Add a name first',
      'Add something for the plate',
      null,
    ],
    'the footer names exactly what is missing for the primary to work: a plan needs a day and a plate, a saved meal a name and a plate, and nothing is said once both are there',
  );
  assert.deepEqual(
    [0, 6, 9, 10, 12].map((total) => getRecentRowWindow(total, false)),
    [
      { shown: 0, hasToggle: false },
      { shown: 6, hasToggle: false },
      { shown: 9, hasToggle: false },
      { shown: 6, hasToggle: true },
      { shown: 6, hasToggle: true },
    ],
    'recent rows fold to six only when more than three would be tucked away',
  );
  assert.deepEqual(
    [9, 10, 12].map((total) => getRecentRowWindow(total, true)),
    [
      { shown: 9, hasToggle: false },
      { shown: 10, hasToggle: true },
      { shown: 12, hasToggle: true },
    ],
    'an unfolded list shows every row and keeps its toggle so it can fold again',
  );
  const picks = [
    { kind: 'RECIPE' as const, id: 'adobo', label: 'Adobo chicken', at: 3 },
    { kind: 'RECIPE' as const, id: 'rice', label: 'Rice', at: 2 },
    { kind: 'MEAL' as const, id: 'm-both', label: 'Adobo and rice', at: 1 },
    { kind: 'MEAL' as const, id: 'm-more', label: 'Taco night', at: 0 },
  ];
  const meals = new Map([
    ['m-both', ['adobo', 'rice']],
    ['m-more', ['adobo', 'tortillas']],
  ]);
  assert.deepEqual(
    [
      getOfferablePicks(picks, new Set(), meals).map((pick) => pick.id),
      getOfferablePicks(picks, new Set(['adobo']), meals).map(
        (pick) => pick.id,
      ),
      getOfferablePicks(picks, new Set(['adobo', 'rice']), meals).map(
        (pick) => pick.id,
      ),
    ],
    [
      ['adobo', 'rice', 'm-both', 'm-more'],
      ['rice', 'm-both', 'm-more'],
      ['m-more'],
    ],
    'what is already on the plate is not offered again: a recipe on it drops out, and a saved meal drops out only once every item of it is there',
  );
  assert.deepEqual(
    rankRecentPicks({
      recipes: [
        { id: 'adobo', title: 'Adobo chicken', createdAt: 5 },
        { id: 'adobo', title: 'Adobo chicken', createdAt: 5 },
        { id: 'rice', title: 'Rice', createdAt: 4 },
      ],
      meals: [],
      plannedMeals: [],
      cookSummaries: new Map(),
    }).map((pick) => pick.id),
    ['adobo', 'rice'],
    'two records that share an id are offered once, so a list keyed by it never has two children with one key',
  );
}

// ---- The planned meal's offer by phase ----
{
  const offerNow = localNoon(2026, 9, 15);
  const plate = [
    { kind: 'RECIPE' as const, refId: 'adobo', servings: 2 },
    { kind: 'RECIPE' as const, refId: 'rice', servings: 2 },
  ];
  const offerOf = (
    over: Partial<Parameters<typeof getPlannedMealOffer>[0]> = {},
    date = dayOf(15),
  ) =>
    getPlannedMealOffer({
      meal: { id: 'm1', date, items: plate },
      recipeIds: ['adobo', 'rice'],
      cookableRecipeIds: ['adobo', 'rice'],
      cookIds: new Set<string>(),
      containers: [],
      savedPlates: [],
      now: offerNow,
      ...over,
    });

  const tonight = offerOf();
  assert.deepEqual(
    [
      tonight.phase,
      tonight.primary,
      tonight.cookRecipeIds,
      tonight.canMarkCooked,
    ],
    ['TODAY', { kind: 'COOK' }, ['adobo', 'rice'], true],
    "tonight's uncooked dinner starts cooking",
  );

  const dueBox = container({ id: 'due', eatBy: dayOf(16) });
  assert.deepEqual(
    offerOf({ containers: [dueBox] }).primary,
    { kind: 'EAT', place: 'FRIDGE' },
    'a box due tomorrow makes eating it the next step',
  );
  assert.deepEqual(
    offerOf({ containers: [container({ eatBy: dayOf(20) })] }).primary,
    { kind: 'COOK' },
    'a box with days to spare is offered as a chip, not the primary',
  );
  assert.deepEqual(
    offerOf({ containers: [container({ eatBy: dayOf(14) })] }).primary,
    { kind: 'COOK' },
    'a box past its date is never the next step',
  );
  assert.deepEqual(
    offerOf({
      containers: [container({ id: 'f', place: 'FREEZER', eatBy: dayOf(15) })],
    }).primary,
    { kind: 'EAT', place: 'FREEZER' },
    'a freezer box due today is the next step when the fridge has none due',
  );

  const halfCooked = offerOf({
    cookIds: new Set(['m1__rice']),
    containers: [dueBox, container({ id: 'r', recipeId: 'rice' })],
  });
  assert.deepEqual(
    [
      halfCooked.primary,
      halfCooked.cookRecipeIds,
      halfCooked.eatFrom.map((box) => box.id),
    ],
    [{ kind: 'COOK' }, ['adobo'], ['due']],
    'once rice is cooked, its boxes go and cooking adobo stays',
  );

  const allCooked = offerOf({
    cookIds: new Set(['m1__adobo', 'm1__rice']),
    containers: [dueBox],
  });
  assert.deepEqual(
    [allCooked.primary, allCooked.cookRecipeIds, allCooked.eatFrom],
    [null, [], []],
    'a cooked dinner has no primary, no cooking and nothing to eat from',
  );

  assert.deepEqual(
    offerOf({
      containers: [
        container({ id: 'own', cookId: 'm1__adobo', eatBy: dayOf(16) }),
        container({ id: 'other', cookId: 'k9', eatBy: dayOf(20) }),
      ],
    }).eatFrom.map((box) => box.id),
    ['other'],
    "a box this meal's own cook made is never offered back to it",
  );
  assert.deepEqual(
    offerOf({
      cookIds: new Set(['m1__rice']),
      containers: [container({ id: 'plate', recipeId: null, mealId: 's1' })],
    }).eatFrom,
    [],
    'a saved-meal box goes once anything on the plate is cooked',
  );

  const yesterday = offerOf({ containers: [dueBox] }, dayOf(14));
  assert.deepEqual(
    [
      yesterday.phase,
      yesterday.primary,
      yesterday.cookRecipeIds,
      yesterday.eatFrom.length,
      yesterday.canMarkCooked,
    ],
    ['PAST', null, [], 1, true],
    'yesterday still offers its boxes and the mark, never a primary or cooking',
  );
  assert.deepEqual(
    offerOf({ containers: [dueBox] }, dayOf(12)).eatFrom,
    [],
    'three days back offers no boxes',
  );

  const ahead = offerOf({ containers: [dueBox] }, dayOf(16));
  assert.deepEqual(
    [
      ahead.phase,
      ahead.primary,
      ahead.cookRecipeIds,
      ahead.eatFrom,
      ahead.canMarkCooked,
    ],
    ['AHEAD', null, ['adobo', 'rice'], [], false],
    'a day ahead has no primary or boxes, can still be cooked ahead, not marked',
  );

  const freezerBox = container({
    id: 'fz',
    place: 'FREEZER',
    eatBy: dayOf(20),
  });
  assert.deepEqual(
    offerOf({ containers: [dueBox, freezerBox] }).more,
    [
      { kind: 'COOK' },
      { kind: 'EAT', place: 'FREEZER', count: 1 },
      { kind: 'SAVE' },
    ],
    "when tonight's due fridge box is the primary, More offers cooking, the freezer box and saving, never the fridge again",
  );
  assert.deepEqual(
    offerOf().more,
    [{ kind: 'SAVE' }],
    "when cooking is tonight's primary, More doesn't offer it a second time",
  );
  assert.deepEqual(
    offerOf({
      cookIds: new Set(['m1__adobo', 'm1__rice']),
      containers: [dueBox, freezerBox],
    }).more,
    [{ kind: 'SAVE' }],
    'a cooked dinner offers no cooking and no box in More',
  );
  assert.deepEqual(
    offerOf({ containers: [dueBox] }, dayOf(16)).more,
    [{ kind: 'COOK' }, { kind: 'SAVE' }],
    'a day ahead offers cooking ahead in More, and no box',
  );
  assert.deepEqual(
    offerOf(
      { containers: [dueBox, container({ id: 'f2', eatBy: dayOf(18) })] },
      dayOf(14),
    ).more,
    [{ kind: 'EAT', place: 'FRIDGE', count: 2 }, { kind: 'SAVE' }],
    'yesterday has no primary, so its fridge boxes are in More with their count, and no cooking',
  );
  assert.deepEqual(
    offerOf(
      {
        meal: { id: 'm1', date: dayOf(12), items: [plate[0]] },
        recipeIds: ['adobo'],
        cookableRecipeIds: ['adobo'],
        containers: [dueBox],
      },
      dayOf(12),
    ).more,
    [],
    'a one-dish meal three days back offers nothing in More but taking it off the day',
  );

  assert.equal(
    offerOf().canSaveAsMeal,
    true,
    'a new two-item plate can be saved',
  );
  assert.equal(
    offerOf({
      savedPlates: [[plate[1], { ...plate[0] }]],
    }).canSaveAsMeal,
    false,
    'a plate that already is a saved meal, in any order, is not offered again',
  );
  assert.equal(
    offerOf({
      savedPlates: [[plate[0], { ...plate[1], servings: 1 }]],
    }).canSaveAsMeal,
    true,
    'a tweaked plate differs from the saved meal it came from',
  );
  assert.equal(
    offerOf({ meal: { id: 'm1', date: dayOf(15), items: [plate[0]] } })
      .canSaveAsMeal,
    false,
    'one item is not worth saving as a meal',
  );
  assert.deepEqual(
    getCookedRecipeIds(
      'm1',
      ['adobo', 'rice'],
      new Set(['m1__rice', 'm2__adobo']),
    ),
    ['rice'],
    "only this meal's own cooks count",
  );
}

// ---- The shared words for a row's price and a cost tile ----
assert.deepEqual(
  [
    formatRowPrice(8.4, true),
    formatRowPrice(8.4, false),
    formatRowPrice(null, false),
    formatRowPrice(undefined, true),
    formatRowPrice(0, false),
  ],
  ['$0.08+', '$0.08', '—', '—', '$0.00'],
  'a row says + when it leaves something out and a dash when nothing is priced',
);
assert.deepEqual(
  [
    formatCostTile(15.4, 9, false),
    formatCostTile(15.4, 0, false),
    formatCostTile(null, 3, false),
    formatCostTile(null, 3, true),
    formatCostTile(15.4, 2, true),
  ],
  ['$0.15 so far', '$0.15', 'No price yet', 'Not priced', '$0.15+'],
  'a tile says so far only while its gaps can still be priced, and a fixed day with a gap says + like its rows',
);

// ---- A plate's title names its items ----
{
  const long = 'Slow-cooker smoky black bean chili';
  assert.deepEqual(
    [
      getPlateTitle(['Adobo chicken', 'Cilantro lime rice']),
      getPlateTitle(['Adobo chicken', 'Cilantro lime rice', 'Banana']),
      getPlateTitle(['A', 'B', 'C', 'D']),
      getPlateTitle(['Adobo chicken']),
      getPlateTitle([]),
    ],
    [
      { title: 'Adobo chicken & Cilantro lime rice', namedCount: 2 },
      { title: 'Adobo chicken, Cilantro lime rice and Banana', namedCount: 3 },
      { title: 'A, B and\u00a02\u00a0more', namedCount: 2 },
      { title: 'Adobo chicken', namedCount: 1 },
      { title: '', namedCount: 0 },
    ],
    'a plate of two names both, of three names all three, and past three names two and counts the rest, never "& 1 more" where a name fits',
  );
  assert.deepEqual(
    [
      getPlateTitle(['Adobo chicken', long]).title,
      getPlateTitle([long, 'Banana', 'Rice']).title,
      getPlateTitle(['Adobo chicken', 'Banana', long]).title,
    ],
    [
      'Adobo chicken &\u00a01\u00a0more',
      `${long} &\u00a02\u00a0more`,
      'Adobo chicken, Banana and\u00a01\u00a0more',
    ],
    'a name over 30 characters is counted instead of named, and the first is always named',
  );
  assert.ok(
    ['A, B and\u00a02\u00a0more', 'Adobo chicken &\u00a01\u00a0more'].every(
      (title) => /(and|&)\u00a0\d+\u00a0more$/.test(title),
    ),
    '"and 2 more" and "& 1 more" are joined with no-break spaces, so a heading never breaks inside them',
  );
  const plateRecipes = new Map([
    ['adobo', { id: 'adobo', title: 'Adobo chicken' }],
  ]) as unknown as Map<string, Recipe>;
  const plateIngredients = new Map([
    ['rice', { id: 'rice', name: 'Rice' }],
  ]) as unknown as Map<string, ResolvedIngredient>;
  const plateItems = [
    { id: 'i1', kind: 'RECIPE', refId: 'adobo', servings: 2 },
    { id: 'i2', kind: 'INGREDIENT', refId: 'rice', servings: 1 },
  ] as PlannedMeal['items'];
  assert.deepEqual(
    [
      getPlannedMealTitle(
        { name: null, items: plateItems },
        plateRecipes,
        plateIngredients,
      ),
      getPlannedMealTitle(
        { name: ' Taco night ', items: plateItems },
        plateRecipes,
        plateIngredients,
      ),
    ],
    ['Adobo chicken & Rice', 'Taco night'],
    'a planned plate the person named keeps its name, and an unnamed one is named by its items',
  );
}

// ---- A cooked meal on the day drawer ----
{
  const cookedNow = localNoon(2026, 9, 15);
  const cooks = new Set(['m1__adobo', 'm1__rice', 'm2__adobo']);
  assert.deepEqual(
    [
      isPlannedMealCooked(
        { id: 'm1', date: dayOf(12) },
        ['adobo', 'rice'],
        cooks,
        cookedNow,
      ),
      isPlannedMealCooked(
        { id: 'm1', date: dayOf(15) },
        ['adobo', 'rice'],
        cooks,
        cookedNow,
      ),
      isPlannedMealCooked(
        { id: 'm2', date: dayOf(12) },
        ['adobo', 'rice'],
        cooks,
        cookedNow,
      ),
      isPlannedMealCooked(
        { id: 'm1', date: dayOf(16) },
        ['adobo', 'rice'],
        cooks,
        cookedNow,
      ),
      isPlannedMealCooked({ id: 'm3', date: dayOf(12) }, [], cooks, cookedNow),
    ],
    [true, true, false, false, false],
    'cooked means every recipe has its own cook, today or before, never ahead or for a plate with no recipe',
  );
}

// ---- The biggest gap first, where it's used, and the package unit ----

const r1Ingredient = (
  id: string,
  name: string,
  gramsPerMl: number | null,
  gramsEach: number | null,
) =>
  ({
    ...repriceIngredient(id),
    name,
    gramsPerMl,
    gramsEach,
  }) as ResolvedIngredient;
const r1Ingredients = new Map(
  [
    r1Ingredient('thigh', 'Chicken thigh', null, null),
    r1Ingredient('soy', 'Soy sauce', 1.2, null),
    r1Ingredient('garlic', 'Garlic', null, 3),
    r1Ingredient('salt', 'Salt', 1.2, null),
    r1Ingredient('lime', 'Lime', null, null),
  ].map((entry) => [entry.id, entry]),
);
const r1Adobo = {
  ...recipe(4, [
    ['thigh', 2, 'LB'],
    ['soy', 0.25, 'CUP'],
    ['garlic', 6, 'EACH'],
    ['salt', 1, 'TSP'],
  ]),
  id: 'r1-adobo',
  title: 'Adobo chicken',
  isArchived: false,
} as Recipe;
const r1Rice = {
  ...recipe(4, [
    ['salt', 0.5, 'TSP'],
    ['lime', 2, 'EACH'],
  ]),
  id: 'r1-rice',
  title: 'Cilantro lime rice',
  isArchived: false,
} as Recipe;
const r1Retired = {
  ...recipe(4, [['salt', 1, 'TSP']]),
  id: 'r1-retired',
  title: 'Retired chili',
  isArchived: true,
} as Recipe;
const r1RecipesById = new Map(
  [r1Adobo, r1Rice, r1Retired].map((entry) => [entry.id, entry]),
);
const r1Tonight = {
  ...plannedOf(
    [{ id: 'a', kind: 'RECIPE', refId: 'r1-adobo', servings: 2 }],
    null,
  ),
  id: 'r1-tonight',
};
const r1Frozen = {
  ...plannedOf(
    [{ id: 'a', kind: 'RECIPE', refId: 'r1-adobo', servings: 40 }],
    fixedThen,
  ),
  id: 'r1-frozen',
};
const r1Uses = getIngredientUses(
  [r1Adobo, r1Rice, r1Retired],
  [r1Tonight, r1Frozen],
  r1RecipesById,
  r1Ingredients,
);
const r1Gaps: Gap[] = [
  { kind: 'NO_PRODUCT', ingredientId: 'salt' },
  { kind: 'NO_PRODUCT', ingredientId: 'garlic' },
  { kind: 'NO_PRODUCT', ingredientId: 'thigh' },
  { kind: 'NO_PRODUCT', ingredientId: 'salt' },
  { kind: 'NOT_COMPARABLE', ingredientId: 'soy' },
];
assert.deepEqual(
  rankGaps(r1Gaps, r1Uses).map((gap) => gap.ingredientId),
  ['thigh', 'soy', 'garlic', 'salt'],
  'gaps rank by weight once each: chicken before soy sauce, garlic and salt',
);
assert.deepEqual(
  rankGaps(
    [
      { kind: 'NO_PRODUCT', ingredientId: 'nowhere' },
      { kind: 'NO_PRODUCT', ingredientId: 'elsewhere' },
    ],
    r1Uses,
  ).map((gap) => gap.ingredientId),
  ['nowhere', 'elsewhere'],
  'gaps nothing uses keep the order they came in',
);
assert.equal(
  getUseText(r1Uses.get('thigh'), r1Ingredients.get('thigh')),
  'Used in Adobo chicken · 1 lb planned',
  'a planned ingredient says the recipe and what the days ahead need, never a frozen day',
);
assert.equal(
  getUseText(r1Uses.get('salt'), r1Ingredients.get('salt')),
  'Used in Adobo chicken and 1 more · 0.5 tsp planned',
  'an ingredient in several listed recipes counts the others, not the archived one',
);
assert.equal(
  getUseText(r1Uses.get('lime'), r1Ingredients.get('lime')),
  'Used in Cilantro lime rice · 2 each',
  'an unplanned ingredient in one recipe says the recipe amount',
);
assert.equal(getUseText(undefined, undefined), null);
assert.deepEqual(
  [10.25, 1.284, 0.318].map((amount) =>
    getUseText(
      {
        recipes: [{ title: 'X', amount, unit: 'TBSP', grams: 1 }],
        planned: [],
        grams: 1,
      },
      undefined,
    ),
  ),
  ['Used in X · 10 tbsp', 'Used in X · 1.3 tbsp', 'Used in X · 0.32 tbsp'],
  'amounts read rounded: whole from 10, one decimal from 1, two below',
);
assert.deepEqual(
  ['thigh', 'soy', 'garlic', 'lime'].map((id) =>
    getPackageUnit(r1Uses.get(id), r1Ingredients.get(id)),
  ),
  ['LB', 'FL_OZ', 'EACH', 'EACH'],
  'a package starts in the unit the recipes measure it by: lb, fl oz for cups, each',
);
assert.equal(
  getPackageUnit(undefined, r1Ingredients.get('thigh')),
  'G',
  "an ingredient nothing uses starts from its serving's unit",
);

// ---- Cooking mode
const cookUtils = await import('../../src/apps/pinch/utils/cooks.ts');
assert.deepEqual(
  [
    cookUtils.getCookStartServings(6, 1),
    cookUtils.getCookStartServings(6, null),
    cookUtils.getCookStartServings(4, 8),
    cookUtils.getCookStartServings(0, null),
    cookUtils.getCookStartServings(0.5, 0.5),
    cookUtils.getCookStartServings(5000, null),
  ],
  [6, 6, 8, 1, 0.5, 1000],
  'cooking starts at the recipe as written, or at the plan when it asks for more',
);
assert.deepEqual(
  [
    cookUtils.stepCookServings(6, 1),
    cookUtils.stepCookServings(6, -1),
    cookUtils.stepCookServings(1, -1),
    cookUtils.stepCookServings(0.5, 1),
    cookUtils.stepCookServings(0.5, -1),
    cookUtils.stepCookServings(2.5, 1),
    cookUtils.stepCookServings(2.5, -1),
    cookUtils.stepCookServings(1.5, -1),
    cookUtils.stepCookServings(1000, 1),
  ],
  [7, 5, 0.5, 1, 0.5, 3, 2, 1, 1000],
  'the servings stepper moves a whole serving a tap, with a half only below one',
);

const { formatKitchenAmount } =
  await import('../../src/apps/pinch/utils/kitchenMeasure.ts');
assert.deepEqual(
  [
    formatKitchenAmount(0.25, 'CUP'),
    formatKitchenAmount(1 / 3, 'CUP'),
    formatKitchenAmount(2 / 3, 'CUP'),
    formatKitchenAmount(0.75, 'CUP'),
    formatKitchenAmount(1, 'CUP'),
    formatKitchenAmount(1.5, 'CUP'),
    formatKitchenAmount(2.33, 'CUP'),
    formatKitchenAmount(0.5, 'TSP'),
    formatKitchenAmount(1.25, 'TSP'),
    formatKitchenAmount(0.125, 'TSP'),
  ],
  [
    '¼ cup',
    '⅓ cup',
    '⅔ cup',
    '¾ cup',
    '1 cup',
    '1½ cups',
    '2⅓ cups',
    '½ tsp',
    '1¼ tsp',
    '⅛ tsp',
  ],
  'scaled amounts read as kitchen fractions, never decimals of a cup',
);
assert.deepEqual(
  [
    formatKitchenAmount(scaleAmount(0.25, 5, 4), 'CUP'),
    formatKitchenAmount(0.31, 'CUP'),
    formatKitchenAmount(0.125, 'CUP'),
    formatKitchenAmount(scaleAmount(1, 1, 3), 'TBSP'),
    formatKitchenAmount(0.5, 'TBSP'),
    formatKitchenAmount(1.25, 'TBSP'),
    formatKitchenAmount(0.4, 'CUP'),
    formatKitchenAmount(0.17, 'LB'),
    formatKitchenAmount(0.05, 'KG'),
    formatKitchenAmount(0.05, 'L'),
  ],
  [
    '5 tbsp',
    '5 tbsp',
    '2 tbsp',
    '1 tsp',
    '1½ tsp',
    '3¾ tsp',
    '6½ tbsp',
    'about 2½ oz',
    '50 g',
    '50 ml',
  ],
  'a sliver of a cup reads in tablespoons, of a tablespoon in teaspoons, of a pound in ounces',
);
assert.deepEqual(
  [
    formatKitchenAmount(scaleAmount(6, 5, 4), 'EACH'),
    formatKitchenAmount(2.5, 'EACH'),
    formatKitchenAmount(scaleAmount(1, 1, 6), 'EACH'),
    formatKitchenAmount(6, 'EACH'),
    formatKitchenAmount(3.4, 'EACH'),
    formatKitchenAmount(0.6, 'CUP'),
    formatKitchenAmount(0.9, 'CUP'),
    formatKitchenAmount(2.75, 'TBSP'),
    formatKitchenAmount(scaleAmount(1, 1, 6), 'TSP'),
    formatKitchenAmount(0.01, 'TSP'),
  ],
  [
    'about 8',
    '2½',
    'about ½',
    '6',
    'about 3',
    'about ⅔ cup',
    'about 1 cup',
    'about 2½ tbsp',
    'about ⅛ tsp',
    'a pinch',
  ],
  'whole items round to a whole or a half and say "about" when they had to round',
);
assert.deepEqual(
  [
    formatKitchenAmount(12.4, 'G'),
    formatKitchenAmount(2.25, 'G'),
    formatKitchenAmount(250, 'ML'),
    formatKitchenAmount(1.25, 'KG'),
    formatKitchenAmount(2.72, 'OZ'),
    formatKitchenAmount(8, 'FL_OZ'),
    formatKitchenAmount(2, 'LB'),
    formatKitchenAmount(0.5, 'LB'),
    formatKitchenAmount(1, 'PINCH'),
    formatKitchenAmount(3, 'PINCH'),
    formatKitchenAmount(0, 'CUP'),
  ],
  [
    '12 g',
    '2.3 g',
    '250 ml',
    '1.25 kg',
    'about 2½ oz',
    '8 fl oz',
    '2 lb',
    '½ lb',
    'a pinch',
    '3 pinches',
    '0 cup',
  ],
  'units without a step-down round sensibly and keep their own unit',
);

const { matchStepIngredients } =
  await import('../../src/apps/pinch/utils/stepIngredients.ts');
const stepLine = (id: string, ...names: string[]) => ({
  id,
  ingredientId: `ing-${names[0]}`,
  names,
});
const adoboLines = [
  stepLine('thigh', 'Chicken thigh', 'chicken thighs'),
  stepLine('soy', 'Soy sauce'),
  stepLine('vinegar', 'White vinegar'),
  stepLine('garlic', 'Garlic'),
  stepLine('bay', 'Bay leaves'),
  stepLine('pepper', 'Black pepper'),
];
assert.deepEqual(
  matchStepIngredients(
    [
      'Marinate the chicken in the soy sauce, vinegar and garlic for 30 minutes.',
      'Simmer 25 minutes with the bay leaves and plenty of pepper. Leave to rest.',
      'Reduce the sauce until it clings to the chicken. Serve hot.',
    ],
    adoboLines,
  ).map((step) => step.lineIds),
  [['thigh', 'soy', 'vinegar', 'garlic'], ['bay', 'pepper'], []],
  'a step lists the lines it is first to name, in the order it names them, by a whole name or a word only one ingredient could mean',
);
assert.deepEqual(
  [
    matchStepIngredients(
      ['Add the garlic powder.', 'Add the garlic.', 'Brown the beef.'],
      [
        stepLine('powder', 'Garlic powder'),
        stepLine('garlic', 'Garlic'),
        stepLine('beef', 'Ground beef'),
        stepLine('sugar', 'Brown sugar'),
      ],
    ).map((step) => step.lineIds),
    matchStepIngredients(
      ['Heat the oil.'],
      [stepLine('olive', 'Olive oil'), stepLine('sesame', 'Sesame oil')],
    ).map((step) => step.lineIds),
    matchStepIngredients(
      ['Heat the oil.'],
      [stepLine('olive', 'Olive oil')],
    ).map((step) => step.lineIds),
    matchStepIngredients(
      ['Fold in the eggs.'],
      [
        { id: 'egg-a', ingredientId: 'egg', names: ['Egg'] },
        stepLine('flour', 'Flour'),
        { id: 'egg-b', ingredientId: 'egg', names: ['Egg'] },
      ],
    ).map((step) => step.lineIds),
    matchStepIngredients(['Stir well and serve.'], adoboLines).map(
      (step) => step.lineIds,
    ),
  ],
  [
    [['powder'], ['garlic'], ['beef']],
    [[]],
    [['olive']],
    [['egg-a', 'egg-b']],
    [[]],
  ],
  'a longer name wins over a shorter one inside it, a word two ingredients share or a colour names nothing, and both lines of one ingredient are listed',
);
assert.deepEqual(
  matchStepIngredients(
    ['Cut the lemon in half and add some water.', 'Flake the tuna.'],
    [
      stepLine('tuna', 'Canned tuna', 'tuna in water'),
      stepLine('cream', 'Half and half', 'half & half'),
      stepLine('lemon', 'Lemon'),
    ],
  ).map((step) => step.lineIds),
  [['lemon'], ['tuna']],
  'a word in the middle of an alias, or a little word like "and" or "half", never names an ingredient on its own',
);
assert.deepEqual(
  matchStepIngredients(
    [
      'Add 2 cups of the broth.',
      'Stir in 350g flour.',
      'Bake at 400°F for 20 minutes.',
      'Cut into 4 wedges.',
    ],
    [],
  ).map((step) => step.hasWrittenAmount),
  [true, true, false, false],
  'a step that writes its own amount is told apart from one that only has a time or a temperature',
);

assert.deepEqual(
  [
    cookUtils.getStepName('Brown the beef in a large pot, about 8 minutes.'),
    cookUtils.getStepName(
      'Simmer everything with the bay leaves for 25 minutes.',
    ),
    cookUtils.getStepName('Uncover and reduce the sauce.'),
    cookUtils.getStepName('Bake.'),
    cookUtils.getStepName('2. Rinse the rice twice'),
    cookUtils.getStepName(''),
  ],
  [
    'Brown the beef',
    'Simmer everything',
    'Uncover and reduce',
    'Bake',
    '2 Rinse',
    '',
  ],
  "a timer is named by its step's first words, without a little word left dangling at the end",
);

// ============================================================
// The shopping list's weekly add, shop order and shop amounts
// ============================================================
const shopPlanned = (id: string, dayKey: string): ShopPlannedMeal =>
  ({
    id,
    date: Date.parse(`${dayKey}T00:00:00Z`),
    mealType: 'DINNER',
    name: null,
    sourceMealId: null,
    items: [{ id: `${id}-1`, kind: 'INGREDIENT', refId: 'rice', servings: 1 }],
    refIds: ['rice'],
    snapshot: null,
    createdAt: 1,
    updatedAt: 1,
  }) as ShopPlannedMeal;
const shopPlanByDay = new Map<string, ShopPlannedMeal[]>([
  ['2026-10-13', [shopPlanned('past', '2026-10-13')]],
  ['2026-10-15', [shopPlanned('today', '2026-10-15')]],
  ['2026-10-31', [shopPlanned('halloween', '2026-10-31')]],
  [
    '2026-11-01',
    [shopPlanned('nov1', '2026-11-01'), shopPlanned('nov1b', '2026-11-01')],
  ],
  ['2026-11-08', [shopPlanned('later', '2026-11-08')]],
]);
const shopSpanIds = (
  startKey: string,
  endKey: string,
  todayKey = '2026-10-15',
) => {
  const span = shopGetPlanInRange(
    shopPlanByDay,
    { startKey, endKey },
    todayKey,
  );
  return [span.startKey, span.meals.map((meal) => meal.id), span.isClamped];
};
assert.deepEqual(
  shopSpanIds('2026-10-15', '2026-10-21'),
  ['2026-10-15', ['today'], false],
  'the next seven days hold the meals planned on them, today included',
);
assert.deepEqual(
  shopSpanIds('2026-10-11', '2026-10-17'),
  ['2026-10-15', ['today'], true],
  'a range that began before today counts from today, and says it left the past out',
);
assert.deepEqual(
  shopSpanIds('2026-10-31', '2026-11-01'),
  ['2026-10-31', ['halloween', 'nov1', 'nov1b'], false],
  'a range across a month boundary (and the end of daylight time) keeps both days, in day order',
);
assert.deepEqual(
  shopSpanIds('2026-11-08', '2026-11-08'),
  ['2026-11-08', ['later'], false],
  'one day is a range whose start and end are the same',
);
assert.deepEqual(
  shopSpanIds('2026-10-16', '2026-10-30'),
  ['2026-10-16', [], false],
  'days with nothing planned give no meals',
);
assert.deepEqual(
  shopSpanIds('2026-10-10', '2026-10-13'),
  ['2026-10-15', [], true],
  'a range wholly in the past gives nothing, starting after it ends',
);

assert.deepEqual(
  SHOP_CATALOG_FAMILIES.filter(
    (family) => SHOP_BY_FAMILY[family.id] === undefined,
  ).map((family) => family.id),
  [],
  'every catalog family has a shop section',
);
assert.deepEqual(
  Object.keys(SHOP_BY_FAMILY).filter(
    (id) => !SHOP_CATALOG_FAMILIES.some((family) => family.id === id),
  ),
  [],
  'the section map names only catalog families',
);
assert.deepEqual(
  Object.keys(SHOP_BY_INGREDIENT).filter((id) => !SHOP_CATALOG_BY_ID.has(id)),
  [],
  'every ingredient shelved away from its family is a catalog ingredient',
);
assert.deepEqual(
  SHOP_SECTION_IDS.filter(
    (section) =>
      section !== 'other' &&
      ![
        ...Object.values(SHOP_BY_FAMILY),
        ...Object.values(SHOP_BY_INGREDIENT),
      ].includes(section),
  ),
  [],
  'every section but Other can hold something from the catalog',
);
assert.deepEqual(
  [
    shopGetSection({ id: 'cat-garlic', familyId: 'cat-fam-onion' }),
    shopGetSection({
      id: 'cat-canned-diced-tomatoes',
      familyId: 'cat-fam-tomato',
    }),
    shopGetSection({ id: 'cat-vanilla-ice-cream', familyId: 'cat-fam-snacks' }),
    shopGetSection({ id: 'mine-1', familyId: 'cat-fam-cheese' }),
    shopGetSection({ id: 'mine-2', familyId: 'custom-family-uuid' }),
    shopGetSection({ id: 'mine-3', familyId: null }),
    shopGetSection(undefined),
  ],
  ['produce', 'pantry', 'frozen', 'dairy', 'other', 'other', 'other'],
  'a section comes from the ingredient when the catalog moves it, else its family, else Other (the person own families included)',
);

const shopAmountText = (
  parts: [number, Unit][],
  section: Parameters<typeof shopAmountOf>[1],
) => {
  const amount = shopAmountOf(
    parts.map(([value, unit]) => ({ amount: value, unit })),
    section,
  );
  return amount ? `${amount.amount} ${amount.unit}` : null;
};
assert.deepEqual(
  [
    shopAmountText([[2.5, 'EACH']], 'produce'),
    shopAmountText([[2, 'EACH']], 'produce'),
    shopAmountText([[scaleAmount(1, 3, 4), 'EACH']], 'produce'),
    shopAmountText([[2.0000001, 'EACH']], 'produce'),
  ],
  ['3 EACH', '2 EACH', '1 EACH', '2 EACH'],
  'a count rounds up to whole ones (2.5 lemons are 3), and float noise is not rounded up',
);
assert.deepEqual(
  [
    shopAmountText([[0.13, 'TSP']], 'spices'),
    shopAmountText([[0.5, 'TBSP']], 'spices'),
    shopAmountText([[1, 'PINCH']], 'spices'),
    shopAmountText([[0.06, 'CUP']], 'spices'),
    shopAmountText([[2, 'G']], 'spices'),
    shopAmountText([[3, 'TSP']], 'spices'),
    shopAmountText([[1, 'TBSP']], 'spices'),
    shopAmountText([[0.13, 'CUP']], 'spices'),
    shopAmountText([[20, 'G']], 'spices'),
  ],
  [null, null, null, null, null, '3 TSP', '1 TBSP', '0.13 CUP', '20 G'],
  'a spice or oil under a tablespoon (or 15 g) needs only its name; a tablespoon or more keeps its amount',
);
assert.deepEqual(
  [
    shopAmountText([[0.06, 'CUP']], 'produce'),
    shopAmountText([[1.88, 'CUP']], 'pantry'),
    shopAmountText([[0.13, 'CUP']], 'pantry'),
  ],
  ['0.06 CUP', '1.88 CUP', '0.13 CUP'],
  'outside spices and oils a small amount keeps its number, and cups stay as scaled (0.13, 1.88)',
);
assert.deepEqual(
  [
    shopAmountText(
      [
        [4.5, 'OZ'],
        [28, 'G'],
      ],
      'snacks',
    ),
    shopAmountText(
      [
        [28, 'G'],
        [4.5, 'OZ'],
      ],
      'snacks',
    ),
    shopAmountText(
      [
        [1, 'TBSP'],
        [2, 'TSP'],
      ],
      'spices',
    ),
    shopAmountText(
      [
        [1, 'TSP'],
        [1, 'TSP'],
      ],
      'spices',
    ),
    shopAmountText([], 'other'),
  ],
  ['5.49 OZ', '5.49 OZ', '1.67 TBSP', null, null],
  'same-kind amounts add up in the unit of the largest, whatever order they came in',
);

const shopLineRows = shopGroupLines(
  [
    { ingredientId: 'cat-doritos', amount: 4.5, unit: 'OZ' },
    { ingredientId: 'cat-garlic', amount: 6, unit: 'EACH' },
    { ingredientId: 'cat-doritos', amount: 28, unit: 'G' },
    { ingredientId: 'cat-garlic', amount: 2, unit: 'TSP' },
    { ingredientId: 'cat-salt', amount: 0.25, unit: 'TSP' },
  ],
  new Map([
    [
      'cat-doritos',
      {
        id: 'cat-doritos',
        name: 'Doritos',
        familyId: 'cat-fam-snacks',
      } as ResolvedIngredient,
    ],
    [
      'cat-garlic',
      {
        id: 'cat-garlic',
        name: 'Garlic',
        familyId: 'cat-fam-onion',
      } as ResolvedIngredient,
    ],
    [
      'cat-salt',
      {
        id: 'cat-salt',
        name: 'Salt',
        familyId: 'cat-fam-spices',
      } as ResolvedIngredient,
    ],
  ]),
);
assert.deepEqual(
  shopLineRows.map((row) => [
    row.name,
    row.lines.length,
    row.amountText,
    row.section,
  ]),
  [
    ['Doritos', 2, '5.49 oz', 'snacks'],
    ['Garlic', 1, '6 each', 'produce'],
    ['Garlic', 1, '2 tsp', 'produce'],
    ['Salt', 1, null, 'spices'],
  ],
  'an add sheet shows one row per ingredient and kind of unit (a tick takes both lines), in the order they came',
);

const shopSplitRows = shopGroupItems(
  [shopItem('chicken', 'LB', 2, false), shopItem('chicken', 'OZ', 4, true)],
  shopSectionIngredients,
);
assert.deepEqual(
  [
    shopSplitRows.toBuy.flatMap((group) => group.rows.map((row) => row.id)),
    shopSplitRows.got.flatMap((group) => group.rows.map((row) => row.id)),
  ],
  [['chicken::MASS'], ['chicken::MASS/got']],
  'an ingredient with an open and a got item is a row in each half, and the two rows never share an id',
);

assert.deepEqual(
  [
    shopIsAtHome({ ingredientId: 'cat-salt', section: 'spices' }),
    shopIsAtHome({ ingredientId: 'cat-olive-oil', section: 'spices' }),
    shopIsAtHome({ ingredientId: 'cat-water', section: 'snacks' }),
    shopIsAtHome({ ingredientId: 'cat-soy-sauce', section: 'pantry' }),
    shopIsAtHome({ ingredientId: 'cat-fresh-ginger', section: 'produce' }),
  ],
  [true, true, true, false, false],
  'spices, oils, vinegar and water start unticked in an add sheet; sauces and fresh ginger stay ticked',
);

const shopCatalog = SHOP_CATALOG.map(
  (entry) => ({ ...entry }) as unknown as ResolvedIngredient,
);
const shopTop = (query: string, count = 8) =>
  shopSearch(shopCatalog, query)
    .slice(0, count)
    .map((entry) => entry.name);
assert.equal(
  shopTop('milk')[0],
  'Whole milk',
  'an alias said exactly ("milk") puts its ingredient first',
);
assert.deepEqual(
  shopTop('milk')
    .slice(1)
    .every((name) => /milk/i.test(name)),
  true,
  'after it come the names with the word in them, before family members without it',
);
assert.deepEqual(
  shopTop('pasta'),
  [
    'Egg noodles',
    'Fettuccine',
    'Lasagna noodles',
    'Macaroni',
    'Penne',
    'Ramen noodles',
    'Rice noodles',
    'Spaghetti',
  ],
  'a family name finds its members ("pasta" lists Pasta & noodles) within the eight shown',
);
assert.equal(
  shopSearch(shopCatalog, 'pasta').at(-1)?.name,
  'Marinara sauce',
  'an alias that only starts with the word comes after the family',
);
assert.deepEqual(
  shopTop('salt', 2),
  ['Salt', 'Kosher salt'],
  'an exact name first, then the names it starts a word of',
);
assert.equal(shopTop('jalapeno')[0], 'Jalapeño', 'accents are ignored');
assert.deepEqual(
  shopTop('chicken', 3),
  ['Chicken breast', 'Chicken broth', 'Chicken drumstick'],
  'names that start with the word come before those that only contain it',
);
assert.equal(
  shopSearch(shopCatalog, '').length,
  shopCatalog.length,
  'an empty search keeps everything',
);
assert.deepEqual(shopTop('zzzz'), [], 'a word nothing has finds nothing');

const shopCoverageOf = (lines: [string, number, Unit][]) => {
  const result = shopCostOf(
    lines.map(([ingredientId, amount, unit]) => ({
      ingredientId,
      amount,
      unit,
    })),
    shopIngredients,
    new Map([['chicken', chickenProduct]]),
  );
  return [shopCoverage(result), result.pricedRowCount, result.rowCount];
};
assert.deepEqual(
  [
    shopCoverageOf([['chicken', 2, 'LB']]),
    shopCoverageOf([
      ['chicken', 2, 'LB'],
      ['chicken', 4, 'OZ'],
      ['rice', 1, 'CUP'],
    ]),
    shopCoverageOf([
      ['chicken', 2, 'LB'],
      ['rice', 1, 'CUP'],
      ['salt', 1, 'TSP'],
    ]),
    shopCoverageOf([
      ['rice', 1, 'CUP'],
      ['salt', 1, 'TSP'],
    ]),
    shopCoverageOf([]),
  ],
  [
    ['all', 1, 1],
    ['some', 1, 2],
    ['tooFew', 1, 3],
    ['none', 0, 2],
    ['none', 0, 0],
  ],
  'the cost line counts rows as the list shows them (two weights of chicken are one) and says nothing in a number below half priced',
);

// ============================================================
// Kitchen's prices, a unit price beside each place and the price read back in the recipes' unit
// ============================================================

const kitaPrice = (priceCents: number, sizeAmount: number, sizeUnit: Unit) => ({
  priceCents,
  sizeAmount,
  sizeUnit,
});
assert.deepEqual(
  [
    kitaUnitPrice(kitaPrice(1999, 6.5, 'LB')),
    kitaUnitPrice(kitaPrice(948, 3, 'LB')),
    kitaUnitPrice(kitaPrice(498, 1, 'LB')),
    kitaUnitPrice(kitaPrice(345, 500, 'G')),
    kitaUnitPrice(kitaPrice(600, 32, 'OZ'), 'LB'),
    kitaUnitPrice(kitaPrice(600, 32, 'OZ')),
    kitaUnitPrice(kitaPrice(499, 12, 'EACH'), 'LB'),
    kitaUnitPrice(kitaPrice(99, 1, 'EACH')),
    kitaUnitPrice(kitaPrice(299, 15, 'FL_OZ')),
    kitaUnitPrice(kitaPrice(300, 2, 'CUP')),
    kitaUnitPrice(kitaPrice(450, 1.5, 'L')),
    kitaUnitPrice(kitaPrice(450, 750, 'ML')),
    kitaUnitPrice(kitaPrice(1000, 2, 'KG'), 'G'),
  ],
  [
    '$3.08 / lb',
    '$3.16 / lb',
    null,
    '$0.69 / 100 g',
    '$3.00 / lb',
    '$0.19 / oz',
    '$0.42 each',
    null,
    '$0.20 / fl oz',
    '$0.19 / fl oz',
    '$3.00 / l',
    '$0.60 / 100 ml',
    '$0.50 / 100 g',
  ],
  'a unit price is said per lb, per 100 g, per fl oz or each, in the default price’s unit when it measures the same way, and not at all for a package of exactly one',
);

const kitaNoBridge = { gramsPerMl: null, gramsEach: null };
assert.deepEqual(
  [
    kitaEcho(kitaPrice(198, 3, 'EACH'), 'EACH', {
      gramsPerMl: null,
      gramsEach: 3,
    }),
    kitaEcho(kitaPrice(948, 3, 'LB'), 'LB', kitaNoBridge),
    kitaEcho(kitaPrice(948, 3, 'LB'), 'G', kitaNoBridge),
    kitaEcho(kitaPrice(299, 15, 'FL_OZ'), 'TBSP', kitaNoBridge),
    kitaEcho(kitaPrice(129, 26, 'OZ'), 'PINCH', {
      gramsPerMl: 1.2,
      gramsEach: null,
    }),
    kitaEcho(kitaPrice(99, 1, 'EACH'), 'CUP', kitaNoBridge),
    kitaEcho(kitaPrice(598, 2, 'LB'), 'EACH', {
      gramsPerMl: null,
      gramsEach: 3,
    }),
  ],
  [
    "That's about $0.66 each in your recipes.",
    "That's about $3.16 per lb in your recipes.",
    "That's about $0.70 per 100 g in your recipes.",
    "That's about $0.10 per tbsp in your recipes.",
    "That's less than $0.01 per pinch in your recipes.",
    null,
    "That's about $0.02 each in your recipes.",
  ],
  'the price form reads a price back in the unit the recipes measure it in, with the cost math’s own bridge, and says nothing when the units can’t be compared',
);

// Recipes list search, sources and the recipe form
// ============================================================

const r2Ingredient = (id: string, name: string, aliases: string[] = []) =>
  ({
    id,
    name,
    familyId: null,
    aliases,
    per100g: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    serving: { amount: 100, unit: 'G' },
    gramsPerMl: null,
    gramsEach: null,
    isCustom: false,
    isAdjusted: false,
    isArchived: false,
  }) as ResolvedIngredient;
const r2Ingredients = new Map(
  [
    r2Ingredient('garlic', 'Garlic'),
    r2Ingredient('thigh', 'Chicken thigh'),
    r2Ingredient('scallion', 'Green onion', ['Scallion']),
    r2Ingredient('rice', 'Jasmine rice'),
  ].map((entry) => [entry.id, entry]),
);
const r2Sources = new Map([
  ['se', { id: 'se', label: 'Serious Eats', createdAt: 0, updatedAt: 0 }],
]);
const r2Recipe = (
  id: string,
  title: string,
  ingredientIds: string[],
  extra: Partial<Recipe> = {},
) =>
  ({
    id,
    title,
    description: null,
    servings: 2,
    prepMinutes: null,
    cookMinutes: null,
    coverPath: null,
    ingredients: ingredientIds.map((ingredientId, index) => ({
      id: `${id}-${index}`,
      ingredientId,
      amount: 1,
      unit: 'G',
      note: null,
    })),
    steps: [],
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: null,
    care: null,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }) as Recipe;
const r2Recipes = [
  r2Recipe('adobo', 'Adobo chicken', ['thigh', 'garlic']),
  r2Recipe('garlic-noodles', 'Garlic noodles', ['scallion']),
  r2Recipe('rice', 'Cilantro lime rice', ['rice'], { sourceId: 'se' }),
  r2Recipe('toast', 'Toast', [], {
    description: 'A weeknight snack, ready in minutes',
  }),
  r2Recipe('gone', 'Mystery stew', ['removed-ingredient'], {
    sourceId: 'deleted-source',
  }),
];
const r2Index = r2BuildIndex(r2Recipes, r2Ingredients, r2Sources);
const r2Find = (query: string) => r2Search(r2Index, query).map((r) => r.id);
assert.deepEqual(
  r2Find('garlic'),
  ['garlic-noodles', 'adobo'],
  'an ingredient finds the recipes that use it, a title that says it first',
);
assert.deepEqual(
  r2Find('chicken thigh'),
  ['adobo'],
  'every word must be found, in the title or the ingredients',
);
assert.deepEqual(
  r2Find('scallion'),
  ['garlic-noodles'],
  "an ingredient's alias finds it too",
);
assert.deepEqual(
  r2Find('serious'),
  ['rice'],
  'the source label finds its recipes',
);
assert.deepEqual(r2Find('weeknight'), ['toast'], 'the description is searched');
assert.deepEqual(r2Find('Cilántro'), ['rice'], 'accents are ignored');
assert.deepEqual(
  r2Find('ice'),
  ['rice'],
  'a word inside a title still finds it, as before',
);
assert.deepEqual(
  r2Find('arlic'),
  ['garlic-noodles'],
  'outside the title a word has to start a word, so a fragment finds only titles',
);
assert.deepEqual(
  r2Find(''),
  r2Recipes.map((recipe) => recipe.id),
  'an empty search keeps every recipe, in order',
);
assert.deepEqual(
  r2Find('deleted'),
  [],
  'a missing source or ingredient adds nothing to search',
);

// The Fridge & freezer list and its sheet
// ============================================================
assert.deepEqual(
  [
    kitbCountCopy(3, 3),
    kitbCountCopy(3, 1),
    kitbCountCopy(3, 0),
    kitbCountCopy(1, 3),
  ].map(({ change, action }) => [change, action]),
  [
    [{ kind: 'SAME' }, 'Save'],
    [{ kind: 'EAT', eaten: 2 }, 'Ate 2'],
    [{ kind: 'ALL' }, 'Ate the rest'],
    [{ kind: 'COUNT', count: 3 }, 'Save'],
  ],
  '"How many are left?": fewer records an eat, none eats the rest, more corrects the count, the same changes nothing',
);
assert.deepEqual(
  [
    kitbCountCopy(3, 1).line,
    kitbCountCopy(1, 3).line,
    kitbCountCopy(2, 2).line,
  ],
  [
    'Records that you ate 2.',
    'Corrects the count from 1 to 3.',
    'It says 2 servings now.',
  ],
  'the line under the stepper says what the answer records',
);

const kitbSoup = (id: string, over: Partial<Container> = {}) =>
  container({
    id,
    title: 'Soup',
    recipeId: 'soup',
    servings: 2,
    place: 'FREEZER',
    eatBy: dayOf(30),
    createdAt: 5000,
    updatedAt: 5000,
    ...over,
  });
const kitbFive = [
  kitbSoup('s1'),
  kitbSoup('s2', { servings: 1 }),
  kitbSoup('s3'),
  kitbSoup('t1', { place: 'FRIDGE', eatBy: dayOf(17) }),
  kitbSoup('u1', { createdAt: 9000, updatedAt: 9000 }),
];
assert.deepEqual(
  kitbGroup(kitbFive).map(({ boxes }) => boxes.map(({ id }) => id)),
  [['s2', 's1', 's3'], ['t1'], ['u1']],
  'boxes put away together are one row (an opened box first); one thawed or put away later is its own row',
);
assert.notEqual(
  kitbBatchKey(kitbSoup('s1')),
  kitbBatchKey(kitbSoup('s1', { eatBy: dayOf(31) })),
  'a box re-dated alone leaves its batch',
);
assert.deepEqual(
  [
    kitbServingsText([{ servings: 2 }, { servings: 2 }, { servings: 2 }]),
    kitbServingsText([{ servings: 3 }, { servings: 2 }, { servings: 2 }]),
    kitbServingsText([{ servings: 1 }, { servings: 1 }]),
    kitbServingsText([{ servings: 4 }]),
  ],
  [
    '3 boxes of 2 servings',
    '3 boxes · 7 servings',
    '2 boxes of 1 serving',
    '4 servings',
  ],
  'a batch says how many boxes and what one holds, or the total when they differ',
);
const kitbFifty = Array.from({ length: 50 }, (_, index) =>
  kitbSoup(`f${String(index).padStart(2, '0')}`, {
    createdAt: 1000 * Math.floor(index / 5),
    eatBy: dayOf(20 + Math.floor(index / 5)),
  }),
);
assert.deepEqual(
  kitbGroup(kitbFifty).map(({ boxes }) => boxes.length),
  Array.from({ length: 10 }, () => 5),
  'fifty boxes in ten put-aways are ten rows of five',
);
const kitbScale = Array.from({ length: 300 }, (_, index) =>
  kitbSoup(`k${String(index).padStart(3, '0')}`, {
    title: `Dish ${index % 40}`,
    recipeId: `dish-${index % 40}`,
    createdAt: index < 60 ? 100 * Math.floor(index / 3) : 100_000 + index,
    eatBy: dayOf(16 + (index % 60)),
  }),
);
const kitbScaleRows = kitbGroup(kitbScale);
assert.equal(
  kitbScaleRows.reduce((sum, { boxes }) => sum + boxes.length, 0),
  300,
  'grouping never loses or repeats a box',
);
assert.ok(
  kitbScaleRows.every(({ key, boxes }) =>
    boxes.every((box) => kitbBatchKey(box) === key),
  ),
  'every box of a row shares its batch',
);
const kitbStarted = performance.now();
Array.from({ length: 20 }, () => kitbGroup(kitbScale));
assert.ok(
  (performance.now() - kitbStarted) / 20 < 20,
  "grouping Taylor's 300 boxes stays well under a frame",
);
assert.deepEqual(
  [
    kitbBoxCopy(3, 3),
    kitbBoxCopy(3, 2),
    kitbBoxCopy(3, 1),
    kitbBoxCopy(3, 0),
  ].map(({ eaten, action }) => [eaten, action]),
  [
    [0, 'Save'],
    [1, 'Ate 1 box'],
    [2, 'Ate 2 boxes'],
    [3, 'Ate them all'],
  ],
  '"How many boxes are left?" only counts down, each box eaten whole',
);

assert.deepEqual(
  [13, 14, 15].map((day) => kitbEatByLabel(dayOf(day), lateOnThe14th)),
  ['Past its date', 'Eat today', 'Eat by tomorrow'],
  'a row says its eat-by once: past, today or tomorrow in the tinted pill',
);
assert.equal(
  kitbEatByLabel(dayOf(18), lateOnThe14th),
  `Eat by ${getEatByPhrase(dayOf(18), lateOnThe14th)}`,
  'a later date is plain words with the date',
);

const kitbEnded = (kind: 'EAT' | 'TOSS' | 'CLEAR' | 'EDIT') =>
  container({
    status: kind === 'EDIT' ? 'IN_STOCK' : 'DONE',
    history: [
      ...container().history,
      makeEvent(kind, 2000, kind === 'EDIT' ? {} : { servings: 4 }),
    ],
  });
assert.deepEqual(
  [
    kitbCanPutBack(kitbEnded('EAT')),
    kitbCanPutBack(kitbEnded('TOSS')),
    kitbCanPutBack(kitbEnded('CLEAR')),
    kitbCanPutBack(kitbEnded('EDIT')),
    kitbCanPutBack(container()),
  ],
  [true, true, true, false, false],
  'any finished box can be put back while what ended it is its last event; one in stock cannot',
);
assert.deepEqual(
  planOf(planUndoEnd(kitbEnded('EAT'), 2000, 3000)),
  {
    servings: 4,
    status: 'IN_STOCK',
    history: container().history,
    updatedAt: 3000,
  },
  'putting back an eaten box restores the count it had before the last eat',
);

assert.deepEqual(
  [
    kitbFrozenAt(kitbSoup('a', { history: [makeEvent('FREEZE', 4000)] })),
    kitbFrozenAt(
      kitbSoup('b', {
        history: [
          makeEvent('FREEZE', 4000),
          makeEvent('THAW', 6000),
          makeEvent('FREEZE', 8000),
        ],
      }),
    ),
    kitbFrozenAt(kitbSoup('c', { history: [], createdAt: 3000 })),
  ],
  [4000, 8000, 3000],
  'a freezer row leads with when it last went in the freezer',
);
assert.deepEqual(
  [
    kitbIsEatByShown({ place: 'FREEZER', eatBy: dayOf(30) }, lateOnThe14th),
    kitbIsEatByShown({ place: 'FREEZER', eatBy: dayOf(21) }, lateOnThe14th),
    kitbIsEatByShown({ place: 'FREEZER', eatBy: dayOf(22) }, lateOnThe14th),
    kitbIsEatByShown({ place: 'FREEZER', eatBy: dayOf(10) }, lateOnThe14th),
    kitbIsEatByShown({ place: 'FRIDGE', eatBy: dayOf(30) }, lateOnThe14th),
  ],
  [false, true, false, true, true],
  'a freezer row names its eat-by only within a week or once past; a fridge row always does',
);

assert.deepEqual(
  [
    finishedOf([
      makeEvent('FRIDGE', 1, { servings: 2, place: 'FRIDGE' }),
      makeEvent('EDIT', 2, { note: 'Count 2 → 3' }),
      makeEvent('EAT', 3, { servings: 1 }),
      makeEvent('EAT', 4, { servings: 3 }),
    ]),
    finishedOf([
      makeEvent('FRIDGE', 1, { servings: 2, place: 'FRIDGE' }),
      makeEvent('EDIT', 2, { note: 'Count 2 → 5' }),
      makeEvent('EAT', 3, { servings: 1 }),
      makeEvent('TOSS', 4, { servings: 4 }),
    ]),
    finishedOf(
      Array.from({ length: MAX_CONTAINER_HISTORY }, (_, index) =>
        index === 0
          ? makeEvent('FRIDGE', 0, { servings: 9, place: 'FRIDGE' })
          : makeEvent('EAT', index, { servings: 1 }),
      ),
    ),
  ],
  ['Ate 4 servings', 'Tossed 4 of 5', 'Ate it all'],
  'what you finished counts what was eaten (a corrected count included), and names no number once the history may have lost an eat',
);

assert.equal(
  kitbFrozenText(
    kitbSoup('z', { history: [makeEvent('FREEZE', localAt(5, 23, 30))] }),
    lateOnThe14th,
  ),
  `Frozen ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(2026, 9, 5))}`,
  'a box frozen late on the 5th, local time, reads as frozen on the 5th in any zone',
);

// ============================================================
// The shopping list remembers what filled it
// ============================================================

assert.deepEqual(
  srcMergeLines([
    { ingredientId: 'rice', amount: 1 / 3, unit: 'CUP', source: 'thu' },
    { ingredientId: 'rice', amount: 1 / 3, unit: 'CUP', source: 'fri' },
    { ingredientId: 'rice', amount: 1 / 3, unit: 'CUP', source: 'thu' },
    { ingredientId: 'salt', amount: 0.001, unit: 'TSP', source: 'thu' },
    { ingredientId: 'milk', amount: 1, unit: 'CUP', source: null },
  ]),
  [
    { ingredientId: 'rice', unit: 'CUP', amount: 1, sources: ['thu', 'fri'] },
    { ingredientId: 'milk', unit: 'CUP', amount: 1, sources: [] },
  ],
  'an add sums one ingredient and unit across sources, rounding once, keeps each source once in the order they came, and a line typed on the list has none',
);
assert.deepEqual(
  [
    srcMergeSources([], ['thu']),
    srcMergeSources(['thu'], ['thu']),
    srcMergeSources(['thu', 'recipe:adobo'], ['fri', 'thu']),
    srcMergeSources(['thu', 'thu'], []),
  ],
  [['thu'], ['thu'], ['recipe:adobo', 'fri', 'thu'], ['thu']],
  'sources are a set: a second add from the same source adds nothing new and moves it to the end',
);
const srcMany = Array.from({ length: SRC_MAX }, (_, index) => `old-${index}`);
const srcCapped = srcMergeSources(srcMany, ['new-1', 'new-2']);
assert.deepEqual(
  [srcCapped.length, srcCapped[0], srcCapped.slice(-2)],
  [SRC_MAX, 'old-2', ['new-1', 'new-2']],
  'past the rules’ cap the oldest sources are let go, so an add never fails on it',
);

const srcRiceRecipe = {
  id: 'rice-pot',
  title: 'Rice pot',
  servings: 3,
  ingredients: [
    { id: 'r1', ingredientId: 'rice', amount: 1, unit: 'CUP', note: null },
    { id: 'r2', ingredientId: 'salt', amount: 0.003, unit: 'TSP', note: null },
  ],
} as unknown as Recipe;
const srcIngredients = new Map([
  ['rice', { id: 'rice', serving: { amount: 0.25, unit: 'CUP' } }],
  ['salt', { id: 'salt', serving: { amount: 1, unit: 'TSP' } }],
]) as unknown as Map<string, ResolvedIngredient>;
const srcRecipeItem = (id: string, servings: number): MealItem => ({
  id,
  kind: 'RECIPE',
  refId: 'rice-pot',
  servings,
});
const srcLines = srcSourcedLines(
  [
    { items: [srcRecipeItem('a', 1), srcRecipeItem('b', 1)], source: 'thu' },
    { items: [srcRecipeItem('c', 1)], source: 'fri' },
    {
      items: [{ id: 'd', kind: 'INGREDIENT', refId: 'rice', servings: 2 }],
      source: null,
    },
  ],
  new Map([['rice-pot', srcRiceRecipe]]),
  srcIngredients,
);
assert.deepEqual(
  srcLines.map((line) => [
    line.ingredientId,
    line.source,
    Math.round(line.amount * 1000) / 1000,
  ]),
  [
    ['rice', 'thu', 0.667],
    ['rice', 'fri', 0.333],
    ['rice', null, 0.5],
  ],
  'each planned meal’s lines carry its id, summed per source and left unrounded; a line too small to show is left out',
);
assert.deepEqual(
  srcMergeLines(srcLines).map((line) => [line.amount, line.sources]),
  [[1.5, ['thu', 'fri']]],
  'thirds from two planned meals round once when they meet on one item',
);

const srcItem = (
  amount: number,
  isChecked: boolean,
  sources?: string[],
): ShoppingItem =>
  ({
    id: 'chicken__LB',
    ingredientId: 'chicken',
    amount,
    unit: 'LB',
    isChecked,
    ...(sources ? { sources } : {}),
    createdAt: 1,
    updatedAt: 1,
  }) as ShoppingItem;
const srcChicken = (source: string | null, amount: number) => ({
  ingredientId: 'chicken',
  amount,
  unit: 'LB' as Unit,
  source,
});
const srcWeek = [srcChicken('thu', 1), srcChicken('fri', 1.5)];
const srcState = (
  lines: ReturnType<typeof srcChicken>[],
  items: ShoppingItem[],
) => {
  const state = srcRowOnList(lines, items);
  return [
    state.isCovered,
    state.matched,
    state.isMatchedOpen,
    state.addLines.map((line) => line.source),
  ];
};
assert.deepEqual(
  [
    srcState(srcWeek, []),
    srcState(srcWeek, [srcItem(1, false, ['thu'])]),
    srcState(srcWeek, [srcItem(2.5, false, ['thu', 'fri'])]),
    srcState(srcWeek, [srcItem(2, false, ['recipe:adobo'])]),
    srcState(srcWeek, [srcItem(2, false, [])]),
    srcState(srcWeek, [srcItem(2, false)]),
    srcState([srcChicken('thu', 1)], [srcItem(1, true, ['thu'])]),
  ],
  [
    [false, [], false, ['thu', 'fri']],
    [false, ['thu'], true, ['fri']],
    [true, ['thu', 'fri'], true, ['thu', 'fri']],
    [false, [], false, ['thu', 'fri']],
    [false, [], false, ['thu', 'fri']],
    [true, [], false, ['thu', 'fri']],
    [true, ['thu'], false, ['thu']],
  ],
  'a row starts unticked only when its own sources put it on the list (still to buy or got); another meal, a recipe or a typed line leaves it ticked, Thursday’s share is never added twice, and an open line written before sources keeps the old guard',
);
assert.deepEqual(
  srcHint(srcRowOnList(srcWeek, [srcItem(2, false)]), '', '2 lb'),
  'On your list · 2 lb',
  'a line written before sources says only that it is on the list',
);
assert.deepEqual(
  [
    srcHint(srcRowOnList(srcWeek, []), '', undefined),
    srcHint(srcRowOnList(srcWeek, [srcItem(2, false)]), '', '2 lb'),
    srcHint(
      srcRowOnList([srcChicken('thu', 1)], [srcItem(2, false)]),
      '',
      null,
    ),
    srcHint(
      srcRowOnList(srcWeek, [srcItem(2.5, false, ['thu', 'fri'])]),
      'Thu dinner and Fri dinner',
      '2.5 lb',
    ),
    srcHint(
      srcRowOnList(srcWeek, [srcItem(1, false, ['thu'])]),
      'Thu dinner',
      '1 lb',
    ),
    srcHint(
      srcRowOnList([srcChicken('thu', 1)], [srcItem(1, true, ['thu'])]),
      'Thu dinner',
      undefined,
    ),
  ],
  [
    null,
    'On your list · 2 lb',
    'On your list',
    'Already on your list for Thu dinner and Fri dinner',
    'Already on your list for Thu dinner; this adds the rest',
    'Already got it for Thu dinner',
  ],
  'the row’s hint names this sheet’s sources that already put it on the list, and keeps “On your list · 2 lb” for what something else put there',
);
assert.deepEqual(
  [
    srcNames(['Thu dinner']),
    srcNames(['Thu dinner', 'Fri lunch']),
    srcNames(['Thu dinner', 'Fri lunch', 'Sat dinner']),
  ],
  ['Thu dinner', 'Thu dinner and Fri lunch', '3 of these meals'],
  'one or two sources are named, more are counted',
);
assert.deepEqual(
  [
    srcDay('2026-10-15', '2026-10-15'),
    srcDay('2026-10-21', '2026-10-15'),
    srcDay('2026-10-22', '2026-10-15'),
    srcDay('2026-10-14', '2026-10-15'),
  ],
  ['Thu', 'Wed', 'Oct 22', 'Oct 14'],
  'a weekday names a day of the coming week only; one further out or already past says its date',
);
assert.deepEqual(
  [
    srcParse('recipe:abc'),
    srcParse('meal:xyz'),
    srcParse('seed-pinch-planned-4'),
  ],
  [
    { kind: 'recipe', id: 'abc', key: 'recipe:abc', servings: null },
    { kind: 'meal', id: 'xyz', key: 'meal:xyz', servings: null },
    {
      kind: 'planned',
      id: 'seed-pinch-planned-4',
      key: 'seed-pinch-planned-4',
      servings: null,
    },
  ],
  'a source names a recipe, a saved meal, or a planned meal by its own id; a recipe source written before servings were kept has none',
);
assert.deepEqual(
  [
    srcParse('recipe:abc:8'),
    srcParse('recipe:abc:2.5'),
    srcParse('recipe:abc:'),
    srcParse('recipe:abc:0'),
  ].map(({ id, key, servings }) => [id, key, servings]),
  [
    ['abc', 'recipe:abc', 8],
    ['abc', 'recipe:abc', 2.5],
    ['abc:', 'recipe:abc:', null],
    ['abc:0', 'recipe:abc:0', null],
  ],
  'a recipe source keeps the servings its add picked (half servings too) under the same key as the recipe; a tail that is not a positive number is part of the id',
);

const srcPlanned = (id: string, items: MealItem[]) =>
  ({ id, items }) as unknown as ShopPlannedMeal;
const srcDayMeals = [
  srcPlanned('lunch', [srcRecipeItem('a', 3)]),
  srcPlanned('dinner', [
    { id: 'b', kind: 'INGREDIENT', refId: 'rice', servings: 2 },
    { id: 'c', kind: 'INGREDIENT', refId: 'salt', servings: 1 },
  ]),
  srcPlanned('gone', [
    { id: 'd', kind: 'RECIPE', refId: 'deleted-recipe', servings: 1 },
  ]),
];
const srcRice = (sources?: string[], isChecked = false) =>
  ({
    id: 'rice__CUP',
    ingredientId: 'rice',
    amount: 1.5,
    unit: 'CUP',
    isChecked,
    ...(sources ? { sources } : {}),
  }) as ShoppingItem;
const srcDayState = (items: ShoppingItem[]) => {
  const day = srcDayOnList(
    srcDayMeals,
    items,
    new Map([['rice-pot', srcRiceRecipe]]),
    srcIngredients,
  );
  return [day.isListed, day.coveredCount, day.rowCount];
};
assert.deepEqual(
  [
    srcDayState([]),
    srcDayState([srcRice(['dinner'])]),
    srcDayState([srcRice(['dinner', 'lunch'])]),
    srcDayState([
      srcRice(['lunch']),
      {
        ...srcRice(['dinner']),
        id: 'salt__TSP',
        ingredientId: 'salt',
        unit: 'TSP',
      },
    ]),
    srcDayState([srcRice(['lunch', 'dinner'], true)]),
    srcDayState([srcRice()]),
  ],
  [
    [false, 0, 2],
    [false, 0, 2],
    [true, 1, 2],
    [true, 1, 2],
    [true, 1, 2],
    [false, 1, 2],
  ],
  'a day is on the list once every planned meal with something to buy put a line there, got or not (a meal whose recipe is gone has nothing to buy); otherwise it counts the rows its sheet starts unticked, a line from before sources included',
);

const srcPlannedOn = (
  id: string,
  dayKey: string,
  name: string | null,
  items: MealItem[],
) =>
  ({
    id,
    date: Date.parse(`${dayKey}T00:00:00Z`),
    mealType: 'DINNER',
    name,
    items,
  }) as unknown as ShopPlannedMeal;
const srcLabelMap = srcLabels(
  [
    { sources: ['p-thu', 'p-gone'] },
    {
      sources: [
        'p-fri',
        'p-far',
        'recipe:rice-pot',
        'recipe:beans',
        'recipe:soup',
        'meal:m1',
        'recipe:gone',
      ],
    },
    {},
  ] as unknown as ShoppingItem[],
  [
    srcPlannedOn('p-thu', '2026-10-15', null, [srcRecipeItem('a', 1)]),
    srcPlannedOn('p-fri', '2026-10-16', 'Taco night', []),
    srcPlannedOn('p-far', '2026-10-30', null, [
      srcRecipeItem('b', 1),
      { id: 'c', kind: 'INGREDIENT', refId: 'rice', servings: 1 },
    ]),
    srcPlannedOn('p-empty', '2026-10-15', null, []),
  ],
  new Map([
    ['rice-pot', srcRiceRecipe],
    ['beans', { ...srcRiceRecipe, id: 'beans', title: 'Beans' }],
    ['soup', { ...srcRiceRecipe, id: 'soup', title: 'Soup' }],
  ]),
  new Map([['m1', { id: 'm1', name: 'Adobo and rice' }]]) as unknown as Map<
    string,
    SrcMeal
  >,
  new Map([['rice', { id: 'rice', name: 'Rice' }]]) as unknown as Map<
    string,
    ResolvedIngredient
  >,
);
const srcFor = (sources: string[]) =>
  srcText(sources, srcLabelMap, '2026-10-15');
assert.deepEqual(
  [
    srcFor(['p-thu', 'p-gone']),
    srcFor(['p-thu', 'p-fri']),
    srcFor(['p-far']),
    srcFor(['recipe:rice-pot']),
    srcFor(['meal:m1', 'recipe:beans']),
    srcFor(['recipe:rice-pot', 'meal:m1', 'p-fri']),
    srcFor(['recipe:rice-pot', 'recipe:beans', 'recipe:soup']),
    srcFor(['p-gone', 'recipe:gone']),
    srcFor([]),
  ],
  [
    'Thu dinner',
    'Thu dinner and Fri dinner',
    'Oct 30 dinner',
    'Rice pot',
    'Adobo and rice and Beans',
    'Fri dinner, Adobo and rice and Rice pot',
    'Beans, Rice pot and Soup',
    null,
    null,
  ],
  'a line says what it is for by name, planned meals by day and meal first, then recipes and saved meals by name, three in full and never only a count; a source that is gone is dropped quietly',
);
assert.equal(
  srcLabelMap.has('p-empty'),
  false,
  'only sources on the list are named',
);

const srcRows = groupShoppingItems(
  [
    { ...shopItem('chicken', 'LB', 2, false), sources: ['a', 'b'] },
    { ...shopItem('chicken', 'OZ', 4, false), sources: ['b', 'c'] },
    shopItem('rice', 'CUP', 1, false),
  ],
  shopSectionIngredients,
);
assert.deepEqual(
  srcRows.toBuy.flatMap((group) =>
    group.rows.map((row) => [row.name, row.sources]),
  ),
  [
    ['Chicken', ['a', 'b', 'c']],
    ['Rice', []],
  ],
  'a row carries every source of the items it stands for, each once, and a line from before sources has none',
);

// ============================================================
// A planned plate of several recipes cooks as one session
// ============================================================

const plateCooks = await import('../../src/apps/pinch/utils/cooks.ts');
const plateRecipes = new Map([
  ['adobo', { steps: ['Marinate', 'Simmer', 'Reduce'] }],
  ['rice', { steps: ['Rinse', 'Cook'] }],
  ['nachos', { steps: [] }],
  ['beans', { steps: ['Blanch'] }],
]);
const plateItem = (
  kind: 'RECIPE' | 'INGREDIENT',
  refId: string,
  servings: number,
) => ({
  kind,
  refId,
  servings,
});
assert.deepEqual(
  plateCooks.getPlateCookRecipes(
    [
      plateItem('RECIPE', 'adobo', 2),
      plateItem('INGREDIENT', 'avocado', 1),
      plateItem('RECIPE', 'nachos', 3),
      plateItem('RECIPE', 'rice', 2),
      plateItem('RECIPE', 'gone', 1),
      plateItem('RECIPE', 'rice', 1.5),
      plateItem('RECIPE', 'beans', 1),
    ],
    plateRecipes,
    ['adobo', 'rice', 'nachos', 'gone'],
  ),
  [
    { recipeId: 'adobo', servings: 2 },
    { recipeId: 'rice', servings: 3.5 },
  ],
  'a plate cooks each recipe with steps that is still to cook, once, in plate order, with the servings its items plan; ingredients, recipes without steps, gone ones and ones already cooked stay out',
);
assert.deepEqual(
  plateCooks.getPlateCookRecipes(
    [plateItem('RECIPE', 'adobo', 999), plateItem('RECIPE', 'adobo', 999)],
    plateRecipes,
    ['adobo'],
  ),
  [{ recipeId: 'adobo', servings: 1000 }],
  'a recipe planned twice on one plate is one entry, capped at the most a cook can record',
);
assert.deepEqual(
  plateCooks.getPlateCookRecipes([], plateRecipes, ['adobo']),
  [],
  'an empty plate cooks nothing',
);
assert.deepEqual(
  plateCooks.getPlateStart([
    { recipeId: 'adobo', recipeServings: 4, plannedServings: 2 },
    { recipeId: 'rice', recipeServings: 4, plannedServings: 6 },
    { recipeId: 'one', recipeServings: 6, plannedServings: null },
    { recipeId: 'none', recipeServings: 0, plannedServings: null },
  ]),
  {
    adobo: { stepIndex: 0, servings: 4, gotOut: {} },
    rice: { stepIndex: 0, servings: 6, gotOut: {} },
    one: { stepIndex: 0, servings: 6, gotOut: {} },
    none: { stepIndex: 0, servings: 1, gotOut: {} },
  },
  'each recipe of a session starts on its first step, nothing ticked, at its own servings or the plan’s when that is more',
);
assert.deepEqual(
  [
    plateCooks.getTimerCaption({
      stepName: 'Simmer everything',
      recipeTitle: null,
    }),
    plateCooks.getTimerCaption({
      stepName: 'Simmer everything',
      recipeTitle: 'Adobo chicken',
    }),
  ],
  ['Simmer everything', 'Adobo chicken · Simmer everything'],
  'a timer is named by its step, and by its recipe first when the session cooks several',
);
const plateTimer = (status: string) => ({ status });
assert.deepEqual(
  [
    plateCooks.countLiveTimers([
      plateTimer('running'),
      plateTimer('paused'),
      plateTimer('done'),
    ]),
    plateCooks.canStartTimer([
      plateTimer('running'),
      plateTimer('paused'),
      plateTimer('running'),
    ]),
    plateCooks.canStartTimer([
      plateTimer('running'),
      plateTimer('paused'),
      plateTimer('running'),
      plateTimer('running'),
    ]),
    plateCooks.canStartTimer([
      plateTimer('running'),
      plateTimer('done'),
      plateTimer('running'),
      plateTimer('done'),
      plateTimer('running'),
    ]),
  ],
  [2, true, false, true],
  'a session runs up to four timers across all its recipes; a finished one waiting for Dismiss doesn’t count',
);

const stepTimer = (
  id: string,
  recipeId: string,
  stepNumber: number,
  label: string,
) => ({ id, recipeId, stepNumber, label });
const simmerAndRest = [
  { seconds: 600, label: '10 min' },
  { seconds: 300, label: '5 min' },
];
const sessionTimers = [
  stepTimer('simmer', 'adobo', 2, '10 min'),
  stepTimer('marinate', 'adobo', 1, '30 min'),
  stepTimer('rice', 'rice', 2, '10 min'),
  stepTimer('edited', 'adobo', 2, '25 min'),
];
assert.deepEqual(
  plateCooks
    .getReadyStepTimers(sessionTimers, {
      recipeId: 'adobo',
      stepNumber: 2,
      durations: simmerAndRest,
    })
    .map((slot) => slot.label),
  ['5 min'],
  'the step on screen offers a Start card only for a time it mentions with no timer yet: its running 10 min lives in the timer view or the pill row, and a timer from another step, another recipe or a time the step no longer says never hides a card',
);
assert.deepEqual(
  plateCooks
    .getReadyStepTimers(sessionTimers, {
      recipeId: 'rice',
      stepNumber: 1,
      durations: simmerAndRest,
    })
    .map((slot) => slot.label),
  ['10 min', '5 min'],
  'a timer on another recipe of the plate with the same length and step number leaves this recipe’s cards ready',
);
assert.deepEqual(
  plateCooks.getReadyStepTimers(sessionTimers, null),
  [],
  'with no step on screen (the ingredient list, the Finish panel) there are no cards',
);
assert.deepEqual(
  plateCooks
    .getReadyStepTimers([], {
      recipeId: 'adobo',
      stepNumber: 4,
      durations: [1, 2, 3, 4, 5, 6].map((minutes) => ({
        seconds: minutes * 60,
        label: `${minutes} min`,
      })),
    })
    .map((slot) => slot.label),
  ['1 min', '2 min', '3 min', '4 min'],
  'a step that mentions six times offers cards for the first four, as many as can run at once',
);

const running = (id: string, endsAt: number) => ({
  id,
  status: 'running' as const,
  endsAt,
});
const paused = (id: string) => ({ id, status: 'paused' as const });
const done = (id: string, endedAt = 0) => ({
  id,
  status: 'done' as const,
  endedAt,
});
assert.deepEqual(
  [
    plateCooks.getFocusedTimerId(
      [running('rice', 9_000), running('adobo', 4_000)],
      null,
    ),
    plateCooks.getFocusedTimerId(
      [running('rice', 9_000), running('adobo', 4_000)],
      'rice',
    ),
    plateCooks.getFocusedTimerId(
      [paused('rice'), running('adobo', 4_000)],
      'rice',
    ),
    plateCooks.getFocusedTimerId([paused('rice'), paused('adobo')], null),
    plateCooks.getFocusedTimerId([], null),
    plateCooks.getFocusedTimerId(
      [running('rice', 9_000), running('adobo', 4_000)],
      'dismissed',
    ),
  ],
  ['adobo', 'rice', 'rice', 'rice', null, 'adobo'],
  'with nothing picked the running timer ending soonest is in focus; the one started or tapped stays in focus, also while paused, even when another ends sooner; a pick that is gone falls back to the soonest',
);
assert.deepEqual(
  [
    plateCooks.getFocusedTimerId(
      [running('rice', 9_000), done('adobo', 100)],
      'rice',
    ),
    plateCooks.getFocusedTimerId([paused('rice'), done('adobo', 100)], 'rice'),
    plateCooks.getFocusedTimerId(
      [done('marinate', 300_000), done('simmer', 100_000)],
      null,
    ),
  ],
  ['adobo', 'adobo', 'simmer'],
  'a finished timer outranks a running or paused pick, and of two finished timers listed in start order the one that rang first (marinate started first but rang at 300 s, simmer at 100 s) is in front',
);
assert.deepEqual(
  [
    plateCooks.getFocusedTimerId(
      [done('simmer', 100_000), done('marinate', 300_000)],
      'marinate',
    ),
    plateCooks.getFocusedTimerId(
      [
        done('marinate', 300_000),
        done('simmer', 100_000),
        done('rice', 200_000),
      ],
      'rice',
    ),
    plateCooks.getFocusedTimerId(
      [done('marinate', 300_000), running('rice', 9_000)],
      'rice',
    ),
  ],
  ['simmer', 'simmer', 'marinate'],
  'a Time’s up already in front stays there when a later finish arrives, even when the later one is the timer the person had picked, and a running pick waits behind it',
);
assert.deepEqual(
  [
    [
      ...plateCooks.getEndedAts(
        [
          { id: 'marinate', endsAt: 300_000 },
          { id: 'simmer', endsAt: 100_000 },
        ],
        0,
      ),
    ],
    [...plateCooks.getEndedAts([{ id: 'rice', endsAt: 5_000 }], 8_000)],
    [
      ...plateCooks.getEndedAts(
        [
          { id: 'a', endsAt: 7_000 },
          { id: 'b', endsAt: 7_000 },
        ],
        0,
      ),
    ],
  ],
  [
    [
      ['simmer', 100_000],
      ['marinate', 300_000],
    ],
    [['rice', 8_001]],
    [
      ['a', 7_000],
      ['b', 7_001],
    ],
  ],
  'two timers that finish in one settle are ranked by their deadlines, not their start order; a deadline behind a Time’s up already waiting (a clock stepped back) is moved past it; two with the same deadline still rank one before the other',
);
assert.deepEqual(
  [0, 59_000, 60_000, 9 * 60_000, 61 * 60_000, 120 * 60_000, -400].map(
    plateCooks.getRangAgo,
  ),
  [
    'Rang just now',
    'Rang just now',
    'Rang 1 min ago',
    'Rang 9 min ago',
    'Rang 1 h 1 min ago',
    'Rang 2 h ago',
    'Rang just now',
  ],
  'a Time’s up says how long ago it rang to the minute: just now under 60 s, then minutes, then hours and minutes, and never a negative age',
);
const ring = (id: string, lastAt: number, repeats: number) => ({
  id,
  lastAt,
  repeats,
});
assert.deepEqual(
  [
    plateCooks.getAlertRepeatsDue([ring('a', 0, 0)], 59_999),
    plateCooks.getAlertRepeatsDue([ring('a', 0, 0)], 60_000),
    plateCooks.getAlertRepeatsDue([ring('a', 0, 4)], 60_000),
    plateCooks.getAlertRepeatsDue([ring('a', 0, 5)], 600_000),
    plateCooks.getAlertRepeatsDue(
      [ring('a', 0, 0), ring('b', 30_000, 0)],
      60_000,
    ),
  ],
  [[], ['a'], ['a'], [], ['a']],
  'a Time’s up nobody dismissed repeats a minute after it last buzzed, five more times and no more, each timer on its own clock',
);
assert.deepEqual(
  [
    plateCooks.getNextAlertRepeatAt([]),
    plateCooks.getNextAlertRepeatAt([ring('a', 10_000, 0)]),
    plateCooks.getNextAlertRepeatAt([
      ring('a', 10_000, 5),
      ring('b', 40_000, 2),
    ]),
    plateCooks.getNextAlertRepeatAt([ring('a', 10_000, 5)]),
  ],
  [null, 70_000, 100_000, null],
  'the next repeat is due a minute after the soonest timer that still has repeats left, and there is none once every Time’s up has used its five',
);
assert.deepEqual(
  [
    plateCooks.getTimerSlotKey({
      recipeId: 'adobo',
      stepNumber: 1,
      label: '30 min',
    }),
    plateCooks.getTimerSlotKey({
      recipeId: 'rice',
      stepNumber: 1,
      label: '30 min',
    }),
  ],
  ['adobo:1:30 min', 'rice:1:30 min'],
  'a timer slot is told apart by recipe, step and length, so the same length on another recipe of the plate is another slot',
);
assert.deepEqual(
  [
    plateCooks.getFocusAfterFinish({ isShown: true, pickedId: 'adobo' }),
    plateCooks.getFocusAfterFinish({ isShown: false, pickedId: 'adobo' }),
  ],
  [
    { isShown: true, pickedId: 'adobo' },
    { isShown: true, pickedId: null },
  ],
  'a finish brings the timer view up, keeping the timer the person was watching (so Dismiss returns to it) and forgetting one already sent to the background',
);
const watchingAdobo = { isShown: true, pickedId: 'adobo' };
assert.deepEqual(
  [
    plateCooks.getFocusAfterDismiss(
      [running('adobo', 9_000), done('rice', 1)],
      watchingAdobo,
      'rice',
    ),
    plateCooks.getFocusAfterDismiss(
      [running('adobo', 9_000), done('rice', 1)],
      { isShown: true, pickedId: null },
      'rice',
    ),
    plateCooks.getFocusAfterDismiss(
      [paused('adobo'), running('rice', 9_000)],
      watchingAdobo,
      'adobo',
    ),
    plateCooks.getFocusAfterDismiss(
      [done('adobo', 1), done('rice', 2)],
      watchingAdobo,
      'adobo',
    ),
    plateCooks.getFocusAfterDismiss(
      [running('adobo', 9_000), running('rice', 4_000)],
      watchingAdobo,
      'rice',
    ),
  ],
  [
    { isShown: true, pickedId: 'adobo' },
    { isShown: false, pickedId: null },
    { isShown: false, pickedId: null },
    { isShown: true, pickedId: null },
    watchingAdobo,
  ],
  'Dismiss on a finished timer returns to the timer the person was watching or just started, else to the step; Reset closes the view; another finished timer takes the front; ending a timer from its row changes nothing',
);
assert.deepEqual(
  [
    plateCooks
      .getTimerRows(
        [
          running('marinate', 9_000),
          paused('rice'),
          done('rest', 1),
          running('simmer', 2_000),
        ],
        'simmer',
      )
      .map((timer) => timer.id),
    plateCooks
      .getTimerRows([running('marinate', 9_000), paused('rice')], null)
      .map((timer) => timer.id),
  ],
  [
    ['rest', 'marinate', 'rice'],
    ['marinate', 'rice'],
  ],
  'the other timers (and the pill row, with nothing in focus) list a finished one first, then the rest in the order they started, so pausing one never moves it',
);

const plateAt = (recipeId: string, stepIndex: number, stepCount: number) => ({
  recipeId,
  stepIndex,
  stepCount,
});
const timerAt = (recipeId: string, stepNumber: number) => ({
  recipeId,
  stepNumber,
});
assert.deepEqual(
  [
    plateCooks.getTimerNext([plateAt('adobo', 0, 3)], timerAt('adobo', 1)),
    plateCooks.getTimerNext([plateAt('adobo', 1, 3)], timerAt('adobo', 1)),
    plateCooks.getTimerNext([plateAt('adobo', 2, 3)], timerAt('adobo', 1)),
    plateCooks.getTimerNext([plateAt('adobo', 2, 3)], timerAt('adobo', 3)),
    plateCooks.getTimerNext(
      [plateAt('adobo', 2, 3), plateAt('rice', 0, 2)],
      timerAt('adobo', 3),
    ),
    plateCooks.getTimerNext(
      [plateAt('adobo', 1, 3), plateAt('rice', 1, 2)],
      timerAt('adobo', 3),
    ),
    plateCooks.getTimerNext([plateAt('adobo', 0, 3)], timerAt('gone', 1)),
    plateCooks.getTimerNext([plateAt('adobo', 1, 3)], timerAt('adobo', 2)),
  ],
  [
    { kind: 'STEP', recipeId: 'adobo', stepIndex: 1 },
    null,
    null,
    null,
    { kind: 'RECIPE', recipeId: 'rice' },
    null,
    null,
    { kind: 'STEP', recipeId: 'adobo', stepIndex: 2 },
  ],
  '"Up next" after a timer is its recipe’s next step only while the person is before that step (on the timer’s own step, or a step behind it); on that next step or past it there is nothing to say, and the same for a lone recipe’s last step or a timer whose recipe is gone; on a plate, the last step leads to the next recipe still short of its own last',
);
const nextAt = (stepIndex: number, timerStep: number) =>
  plateCooks.getTimerNext(
    [plateAt('adobo', stepIndex, 3)],
    timerAt('adobo', timerStep),
  );
assert.deepEqual(
  [
    plateCooks.getTimerSecondary(nextAt(0, 1), 'running'),
    plateCooks.getTimerSecondary(nextAt(2, 1), 'done'),
    plateCooks.getTimerSecondary(nextAt(2, 1), 'running'),
    plateCooks.getTimerSecondary(nextAt(2, 1), 'paused'),
    plateCooks.getTimerSecondary(nextAt(1, 1), 'done'),
    plateCooks.getTimerSecondary(nextAt(2, 3), 'running'),
    plateCooks.getTimerSecondary(nextAt(2, 3), 'done'),
    plateCooks.getTimerSecondary(nextAt(0, 1), 'done'),
  ],
  ['NEXT', null, 'BACK', 'BACK', null, 'BACK', null, 'NEXT'],
  'on the timer’s own step the footer offers Next; a Time’s up that rang over a later step (or over the very step it points to) offers only Dismiss, so no two buttons end at the same screen; a timer brought up from a pill while the person is further on offers a way back to their step instead, as does a running timer on the last step',
);
const platePositions = [plateAt('adobo', 0, 3), plateAt('rice', 0, 2)];
assert.deepEqual(
  [
    plateCooks.getMeanwhile(
      platePositions,
      'adobo',
      plateCooks.getTimerNext(platePositions, timerAt('adobo', 1)),
    ),
    plateCooks.getMeanwhile([plateAt('adobo', 0, 3)], 'adobo', null),
    plateCooks.getMeanwhile(
      [plateAt('adobo', 0, 3), plateAt('rice', 1, 2)],
      'adobo',
      null,
    ),
    plateCooks.getMeanwhile(
      [plateAt('adobo', 2, 3), plateAt('rice', 0, 2)],
      'adobo',
      plateCooks.getTimerNext(
        [plateAt('adobo', 2, 3), plateAt('rice', 0, 2)],
        timerAt('adobo', 3),
      ),
    ),
    plateCooks.getMeanwhile(
      [plateAt('adobo', 0, 3), plateAt('rice', 0, 2), plateAt('beans', 1, 4)],
      'rice',
      { kind: 'STEP', recipeId: 'rice', stepIndex: 1 },
    ),
    plateCooks.getMeanwhile(platePositions, 'gone', null),
  ],
  [
    { recipeId: 'rice', stepIndex: 0 },
    null,
    null,
    null,
    { recipeId: 'beans', stepIndex: 1 },
    null,
  ],
  'on a plate the timer view offers the other recipe that still has a step to do, opening on its own current step; never on a lone recipe, when the other recipe is already on its last step, or when "Up next" already names that recipe; the next recipe in plate order comes first',
);
assert.deepEqual(
  [
    plateCooks.getFirstSentence(
      'Add the vinegar, then simmer for 25 minutes. Stir once. Serve.',
    ),
    plateCooks.getFirstSentence('Cook the rice.'),
    plateCooks.getFirstSentence('Bake at 180°C for 1.5 hours. Rest it.'),
    plateCooks.getFirstSentence('Season to taste e.g. salt'),
    plateCooks.getFirstSentence('Chop the onions\nthen fry them. Done.'),
    plateCooks.getFirstSentence('  Whisk the eggs!  2 at a time.'),
    plateCooks.getFirstSentence(''),
  ],
  [
    'Add the vinegar, then simmer for 25 minutes.',
    'Cook the rice.',
    'Bake at 180°C for 1.5 hours.',
    'Season to taste e.g. salt',
    'Chop the onions',
    'Whisk the eggs!',
    '',
  ],
  '"Up next" reads a step up to its first sentence end or line break, never at a decimal point or a stop before a lowercase word',
);

assert.deepEqual(
  [
    plateCooks.getPlateNext(
      [plateAt('adobo', 1, 3), plateAt('rice', 0, 2)],
      'adobo',
    ),
    plateCooks.getPlateNext(
      [plateAt('adobo', 2, 3), plateAt('rice', 0, 2)],
      'adobo',
    ),
    plateCooks.getPlateNext(
      [plateAt('adobo', 2, 3), plateAt('rice', 1, 2), plateAt('beans', 0, 4)],
      'rice',
    ),
    plateCooks.getPlateNext(
      [plateAt('adobo', 0, 3), plateAt('rice', 1, 2), plateAt('beans', 3, 4)],
      'beans',
    ),
    plateCooks.getPlateNext(
      [plateAt('adobo', 2, 3), plateAt('rice', 1, 2)],
      'rice',
    ),
    plateCooks.getPlateNext(
      [plateAt('adobo', 9, 3), plateAt('rice', 1, 2)],
      'rice',
    ),
    plateCooks.getPlateNext(
      [plateAt('adobo', 2, 3), plateAt('gone', 0, 0)],
      'adobo',
    ),
    plateCooks.getPlateNext([plateAt('one', 0, 1)], 'one'),
    plateCooks.getPlateNext([plateAt('one', 0, 0)], 'one'),
  ],
  [
    { kind: 'STEP' },
    { kind: 'RECIPE', recipeId: 'rice' },
    { kind: 'RECIPE', recipeId: 'beans' },
    { kind: 'RECIPE', recipeId: 'adobo' },
    { kind: 'FINISH' },
    { kind: 'FINISH' },
    { kind: 'FINISH' },
    { kind: 'FINISH' },
    { kind: 'FINISH' },
  ],
  'the wide button steps on, then moves to the next recipe still short of its last step (wrapping to the start), and finishes the plate only once every recipe is on its last',
);

// ============================================================
// The shopping list's All view
// ============================================================
assert.deepEqual(
  designShopViews.map((view) => designShopLabels[view]),
  ['To buy', 'Got it', 'All'],
  'the switch offers To buy, Got it and All, in that order',
);
assert.equal(
  getShownShoppingView(shopPick('all'), '', { toBuy: 0, got: 4 }),
  'all',
  'All is kept with nothing left to buy',
);
assert.equal(
  getShownShoppingView(shopPick('all'), 'milk', { toBuy: 0, got: 1 }),
  'all',
  'a search never moves the list away from All, which already shows both halves',
);
assert.equal(
  getShownShoppingView(shopPick('all'), 'zz', { toBuy: 0, got: 0 }),
  'all',
  'a search that matches nothing keeps All',
);
assert.equal(
  getShownShoppingView(shopPick('toBuy'), 'milk', { toBuy: 0, got: 2 }),
  'got',
  'a half picked by the person falls to the other half, never to All',
);
const designHeld = groupShoppingItems(
  heldItems,
  shopSectionIngredients,
  new Map([['rice__CUP', false]]),
);
const designRowIds = (groups: { rows: { id: string }[] }[]) =>
  groups.flatMap((group) => group.rows.map((row) => row.id));
assert.equal(
  designRowIds(designHeld.toBuy).length + designRowIds(designHeld.got).length,
  heldItems.length,
  'All counts every row once: a held row sits in one half only',
);

// ============================================================
// A recipe line may have no amount ("salt to taste")
// ============================================================
{
  const { getPricedCoverage, getPeriodStats } =
    await import('../../src/apps/pinch/utils/stats.ts');
  const { getDateOfDayKey } =
    await import('../../src/apps/pinch/utils/dayKeys.ts');
  const {
    countOpenShopRows,
    getItemRowIds,
    getOpenItemsByRow,
    sumShopAmounts,
    groupShopLines,
  } = await import('../../src/apps/pinch/utils/shopping.ts');
  const { getLineCost } =
    await import('../../src/apps/pinch/utils/recipeMath.ts');

  const amtLine = (
    id: string,
    ingredientId: string,
    amount: number | null,
    unit: Unit,
    note: string | null = null,
  ) => ({ id, ingredientId, amount, unit, note });
  const amtRecipe = (
    id: string,
    servings: number,
    lines: ReturnType<typeof amtLine>[],
  ) =>
    ({
      id,
      title: id,
      servings,
      ingredients: lines,
      steps: [],
      nutritionOverride: null,
      isArchived: false,
    }) as unknown as Recipe;
  const amtThigh = { ...repriceIngredient('thigh'), name: 'Chicken thigh' };
  const amtSalt = {
    ...repriceIngredient('salt'),
    name: 'Salt',
    per100g: { calories: null, protein: null, carbs: null, fat: null },
    gramsPerMl: 1.2,
  } as ResolvedIngredient;
  const amtParsley = {
    ...repriceIngredient('parsley'),
    name: 'Parsley',
    familyId: 'cat-fam-herbs',
  };
  const amtById = new Map(
    [amtThigh, amtSalt, amtParsley].map((entry) => [entry.id, entry]),
  );
  const amtThighProduct = product('thigh', 948, 3, 'LB');
  const amtSaltProduct = product('salt', 199, 26, 'OZ');
  const amtAdobo = amtRecipe('adobo', 4, [
    amtLine('l1', 'thigh', 2, 'LB'),
    amtLine('l2', 'salt', null, 'EACH', 'to taste'),
    amtLine('l3', 'parsley', null, 'EACH', 'a handful'),
  ]);

  // cost: a line with no amount is neither priced nor a gap, priced or not
  const amtCost = getRecipeCost(
    amtAdobo,
    amtById,
    new Map([['thigh', amtThighProduct]]),
  );
  assert.equal(Math.round(amtCost.totalCents ?? 0), 632);
  assert.deepEqual(
    amtCost.leftOut,
    [],
    'salt to taste with no price is not something left out',
  );
  assert.deepEqual(amtCost.lines.get('l2'), { cents: null, gap: null });
  assert.deepEqual(
    getLineCost(amtAdobo.ingredients[1], amtSalt, amtSaltProduct),
    { cents: null, gap: null },
    'a priced ingredient still adds nothing for a line with no amount',
  );
  const amtOnlyTaste = getRecipeCost(
    amtRecipe('seasoning', 2, [amtLine('a', 'salt', null, 'EACH')]),
    amtById,
    new Map([['salt', amtSaltProduct]]),
  );
  assert.deepEqual(
    [amtOnlyTaste.totalCents, amtOnlyTaste.leftOut],
    [null, []],
    'a recipe of only lines with no amount has no total and nothing left out',
  );

  // nutrition: a line with no amount adds nothing and is never missing
  const amtNutrition = getRecipeNutrition(amtAdobo, amtById);
  assert.deepEqual(
    amtNutrition.missing,
    [],
    'salt to taste, which has no nutrition, is not missing from any metric',
  );
  assert.equal(
    Math.round(amtNutrition.values.calories ?? 0),
    Math.round((2 * 453.59237 * 2) / 4),
    'the per-serving calories come from the measured lines alone',
  );

  // coverage and the period's gaps: lines with no amount don't count
  const amtMeal = {
    ...plannedOf(
      [{ id: 'i1', kind: 'RECIPE', refId: 'adobo', servings: 4 }],
      null,
    ),
    id: 'amt-m1',
    date: getDateOfDayKey('2026-10-15'),
  } as PlannedMeal;
  const amtRange = { startKey: '2026-10-15', endKey: '2026-10-21' };
  assert.deepEqual(
    getPricedCoverage([amtMeal], amtRange, new Map([['adobo', amtAdobo]]), []),
    { usedCount: 1, pricedCount: 1 },
    'priced coverage counts only the measured line: chicken, not salt or parsley',
  );
  const amtStats = getPeriodStats([amtMeal], amtRange, {
    recipeCosts: new Map([['adobo', amtCost]]),
    ingredientsById: amtById,
    defaultProducts: new Map([['thigh', amtThighProduct]]),
    recipeNutrition: new Map([['adobo', amtNutrition]]),
  });
  assert.deepEqual(
    [amtStats.leftOut, amtStats.openNutritionMissing],
    [[], []],
    'a planned recipe with salt to taste leaves nothing out of the period',
  );

  // gap ranking and "Used in": lines with no amount aside
  const amtUses = getIngredientUses(
    [amtAdobo],
    [amtMeal],
    new Map([['adobo', amtAdobo]]),
    amtById,
  );
  assert.equal(amtUses.has('salt'), false, 'salt to taste is no use to rank');
  assert.equal(
    getUseText(amtUses.get('thigh'), amtById.get('thigh')),
    'Used in adobo · 2 lb planned',
  );

  // shopping lines: a line with no amount is just the name, in EACH, and never scales
  assert.deepEqual(
    getRecipeLines(amtAdobo, amtById, 1),
    [
      { ingredientId: 'thigh', amount: 0.5, unit: 'LB' },
      { ingredientId: 'salt', amount: null, unit: 'EACH' },
      { ingredientId: 'parsley', amount: null, unit: 'EACH' },
    ],
    'scaling down halves the chicken and leaves salt and parsley as names',
  );
  assert.deepEqual(
    getRecipeLines(amtAdobo, amtById, 6).map((line) => line.amount),
    [3, null, null],
    'scaling 4 to 6 servings never makes "1.5 salt"',
  );

  // merging, both orders: null + null = null, null + x = x, x + null = x
  assert.deepEqual(
    mergeLines([
      { ingredientId: 'salt', amount: null, unit: 'EACH' },
      { ingredientId: 'salt', amount: null, unit: 'EACH' },
    ]),
    [{ ingredientId: 'salt', amount: null, unit: 'EACH' }],
    'two name-only lines stay one name-only line',
  );
  assert.deepEqual(
    [
      mergeLines([
        { ingredientId: 'lemon', amount: null, unit: 'EACH' },
        { ingredientId: 'lemon', amount: 2, unit: 'EACH' },
      ]),
      mergeLines([
        { ingredientId: 'lemon', amount: 2, unit: 'EACH' },
        { ingredientId: 'lemon', amount: null, unit: 'EACH' },
      ]),
    ],
    [
      [{ ingredientId: 'lemon', amount: 2, unit: 'EACH' }],
      [{ ingredientId: 'lemon', amount: 2, unit: 'EACH' }],
    ],
    'a name-only line adds nothing to a line with an amount, in either order',
  );
  assert.deepEqual(
    [
      mergeLines([
        { ingredientId: 'salt', amount: null, unit: 'EACH' },
        { ingredientId: 'salt', amount: 1, unit: 'TSP' },
      ]),
      mergeLines([
        { ingredientId: 'salt', amount: 1, unit: 'TSP' },
        { ingredientId: 'salt', amount: null, unit: 'EACH' },
      ]),
    ],
    [
      [{ ingredientId: 'salt', amount: 1, unit: 'TSP' }],
      [{ ingredientId: 'salt', amount: 1, unit: 'TSP' }],
    ],
    'a line with an amount in any unit takes in the name-only line of the same ingredient',
  );
  assert.deepEqual(
    mergeLines([
      { ingredientId: 'salt', amount: 0.001, unit: 'TSP' },
      { ingredientId: 'salt', amount: null, unit: 'EACH' },
    ]),
    [{ ingredientId: 'salt', amount: null, unit: 'EACH' }],
    'an amount that rounds to nothing leaves the name-only line, so the ingredient is never lost',
  );
  assert.deepEqual(
    getItemsLines(
      [
        { id: 'a', kind: 'RECIPE', refId: 'adobo', servings: 4 },
        { id: 'b', kind: 'RECIPE', refId: 'rub', servings: 1 },
      ],
      new Map([
        ['adobo', amtAdobo],
        ['rub', amtRecipe('rub', 1, [amtLine('r1', 'salt', 2, 'TSP')])],
      ]),
      amtById,
    ),
    [
      { ingredientId: 'thigh', amount: 2, unit: 'LB' },
      { ingredientId: 'parsley', amount: null, unit: 'EACH' },
      { ingredientId: 'salt', amount: 2, unit: 'TSP' },
    ],
    'from a plan, salt to taste and 2 tsp of salt is 2 tsp, and parsley stays a name',
  );

  // what a line writes on its item
  const amtOpen = (amount: number | null) => ({ amount, isChecked: false });
  const amtGot = (amount: number | null) => ({ amount, isChecked: true });
  const amtName = { ingredientId: 'salt', amount: null, unit: 'EACH' as Unit };
  const amtThree = { ingredientId: 'salt', amount: 3, unit: 'EACH' as Unit };
  assert.deepEqual(
    [
      getMergedFields(amtOpen(3), amtName, 9).amount,
      getMergedFields(amtOpen(null), amtThree, 9).amount,
      getMergedFields(amtOpen(null), amtName, 9).amount,
      getMergedFields(amtGot(3), amtName, 9),
      getMergedFields(null, amtName, 9, true),
    ],
    [
      3,
      3,
      null,
      { amount: null, isChecked: false, updatedAt: 9 },
      { amount: null, isChecked: true, updatedAt: 9 },
    ],
    'an open item keeps its amount, a name-only one takes an amount, and a got one starts again as just the name',
  );

  // sums and rows: a name-only part has no amount to add
  assert.deepEqual(
    [
      sumShopAmounts([{ amount: null, unit: 'EACH' }]),
      sumShopAmounts([
        { amount: null, unit: 'EACH' },
        { amount: 1.4, unit: 'EACH' },
      ]),
    ],
    [null, { amount: 2, unit: 'EACH' }],
    'only amounts add up, and a count still rounds up',
  );
  assert.deepEqual(
    groupShopLines(
      [{ ingredientId: 'parsley', amount: null, unit: 'EACH' }],
      amtById,
    ).map((row) => [row.name, row.amountText]),
    [['Parsley', null]],
    'an add sheet lists a name-only line as the name alone',
  );
  const amtItem = (
    id: string,
    ingredientId: string,
    amount: number | null,
    unit: Unit,
    isChecked = false,
  ) =>
    ({
      id,
      ingredientId,
      amount,
      unit,
      isChecked,
      createdAt: 1,
      updatedAt: 1,
    }) as ShoppingItem;
  const amtList = [
    amtItem('parsley__EACH', 'parsley', null, 'EACH'),
    amtItem('parsley__G', 'parsley', 30, 'G'),
    amtItem('salt__EACH', 'salt', null, 'EACH'),
    amtItem('thigh__EACH', 'thigh', null, 'EACH', true),
    amtItem('thigh__LB', 'thigh', 2, 'LB'),
  ];
  const amtGrouped = groupShoppingItems(amtList, amtById);
  assert.deepEqual(
    amtGrouped.toBuy
      .flatMap((group) => group.rows)
      .map((row) => [row.name, row.amountText, row.itemIds])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ['Chicken thigh', '2 lb', ['thigh__LB']],
      ['Parsley', '30 g', ['parsley__G', 'parsley__EACH']],
      ['Salt', null, ['salt__EACH']],
    ],
    'a name-only item rides with the same ingredient’s amount on its side of the list, and alone it is the name',
  );
  assert.deepEqual(
    amtGrouped.got
      .flatMap((group) => group.rows)
      .map((row) => [row.name, row.amountText]),
    [['Chicken thigh', null]],
    'a got name-only item never joins an open row',
  );
  assert.equal(
    countOpenShopRows(amtList),
    3,
    'the badge counts the rows drawn, not the items',
  );
  assert.deepEqual(
    [...getItemRowIds([amtList[0], amtList[1]]).values()],
    ['parsley::MASS', 'parsley::MASS'],
  );
  const amtSheetRows = groupShopLines(
    [
      { ingredientId: 'parsley', amount: null, unit: 'EACH' },
      { ingredientId: 'thigh', amount: 1, unit: 'EACH' },
    ],
    amtById,
  );
  const amtJoined = getOpenItemsByRow(amtSheetRows, amtList);
  assert.deepEqual(
    [
      amtJoined.get('parsley::COUNT')?.map((item) => item.id),
      amtJoined.has('thigh::COUNT'),
    ],
    [['parsley__EACH', 'parsley__G'], false],
    'a name-only row is on your list when any open line of it is; a counted one only in its own kind of unit',
  );

  // the list's cost: a name-only line is neither counted nor left out
  const amtListCost = getShoppingCost(
    amtList.filter((item) => !item.isChecked),
    amtById,
    new Map([['thigh', amtThighProduct]]),
  );
  assert.deepEqual(
    [
      Math.round(amtListCost.totalCents ?? 0),
      amtListCost.rowCount,
      amtListCost.pricedRowCount,
      amtListCost.leftOut.map((gap) => gap.ingredientId),
    ],
    [632, 2, 1, ['parsley']],
    'the list prices 2 lb of chicken, counts 30 g of parsley as unpriced, and leaves salt by name out of both',
  );

  // a tweak says plainly when a line gains or loses its amount
  const amtContent = (lines: ReturnType<typeof amtLine>[]): RecipeContent => ({
    title: 'Adobo',
    description: null,
    servings: 4,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: lines,
    steps: [],
    nutritionOverride: null,
    sourceId: null,
  });
  const amtNames = new Map([
    ['salt', { name: 'Salt' }],
    ['parsley', { name: 'Parsley' }],
    ['seasalt', { name: 'Sea salt' }],
  ]);
  assert.deepEqual(
    [
      getRecipeChanges(
        amtContent([amtLine('l', 'salt', 1, 'TSP')]),
        amtContent([amtLine('l', 'salt', null, 'EACH', 'to taste')]),
        amtNames,
      ),
      getRecipeChanges(
        amtContent([amtLine('l', 'salt', null, 'EACH')]),
        amtContent([amtLine('l', 'salt', 2, 'TSP')]),
        amtNames,
      ),
      getRecipeChanges(
        amtContent([amtLine('l', 'salt', null, 'TSP')]),
        amtContent([amtLine('l', 'salt', null, 'EACH')]),
        amtNames,
      ),
      getRecipeChanges(
        amtContent([]),
        amtContent([amtLine('p', 'parsley', null, 'EACH', 'a handful')]),
        amtNames,
      ),
      getRecipeChanges(
        amtContent([amtLine('l', 'salt', null, 'EACH')]),
        amtContent([amtLine('l', 'seasalt', null, 'EACH')]),
        amtNames,
      ),
    ],
    [
      ['Salt 1 tsp → no amount', 'Added a note to Salt'],
      ['Salt no amount → 2 tsp'],
      [],
      ['Added Parsley'],
      ['Swapped Salt for Sea salt'],
    ],
    'a tweak names a line losing or gaining its amount, and a line with no amount has no unit to change',
  );
}

// The recipe form keeps "no amount" as a choice, not a gap to fix
{
  const {
    getDataFromExtracted,
    getInitialData,
    isRowAmountValid,
    toRecipeLine,
  } =
    await import('../../src/apps/pinch/components/recipes/recipeFormModel.ts');
  const { resolveIngredients } =
    await import('../../src/apps/pinch/utils/resolveIngredient.ts');

  const amtRead = getDataFromExtracted(
    {
      title: 'Shakshuka',
      servings: 3,
      prepMinutes: null,
      cookMinutes: null,
      description: null,
      ingredients: [
        { name: 'eggs', amount: 6, unit: 'EACH', note: null },
        { name: 'salt', amount: null, unit: null, note: 'to taste' },
        { name: 'parsley', amount: null, unit: null, note: 'a handful' },
        { name: 'salt', amount: null, unit: null, note: 'to taste' },
      ],
      steps: [],
      care: null,
      unread: [],
    },
    resolveIngredients([]),
  );
  assert.deepEqual(
    amtRead.ingredients.map((row) => [
      row.amount,
      row.isAmountless,
      row.note,
      isRowAmountValid(row),
    ]),
    [
      ['6', false, null, true],
      ['', true, 'to taste', true],
      ['', true, 'a handful', true],
      ['', true, 'to taste', true],
    ],
    'a reading keeps "to taste" and "a handful" as rows with no amount, ready to save',
  );
  assert.deepEqual(
    toRecipeLine({ ...amtRead.ingredients[1], unit: 'TSP' }),
    {
      id: amtRead.ingredients[1].id,
      ingredientId: amtRead.ingredients[1].ingredientId,
      amount: null,
      unit: 'EACH',
      note: 'to taste',
      group: null,
    },
    'a row with no amount saves none, in EACH, whatever unit the drawer last had',
  );
  const amtTyped = (amount: string) => ({
    ...amtRead.ingredients[0],
    amount,
  });
  assert.deepEqual(
    ['', '0', '2', 'abc'].map((amount) => isRowAmountValid(amtTyped(amount))),
    [false, false, true, false],
    'a blank amount the person did not choose is still something to fix',
  );
  const amtStored = {
    id: 'adobo',
    title: 'Adobo',
    description: null,
    servings: 4,
    prepMinutes: null,
    cookMinutes: null,
    coverPath: null,
    ingredients: [
      {
        id: 'a',
        ingredientId: 'cat-chicken-thigh',
        amount: 2,
        unit: 'LB' as const,
        note: null,
        group: null,
      },
      {
        id: 'b',
        ingredientId: 'cat-salt',
        amount: null,
        unit: 'EACH' as const,
        note: 'to taste',
        group: null,
      },
    ],
    steps: [],
    nutritionOverride: null,
    source: 'MANUAL' as const,
    sourceId: null,
    care: null,
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
  } satisfies Recipe;
  const amtRows = getInitialData(amtStored).ingredients;
  assert.deepEqual(
    amtRows.map((row) => [row.amount, row.isAmountless]),
    [
      ['2', false],
      ['', true],
    ],
  );
  assert.deepEqual(
    amtRows.map(toRecipeLine),
    amtStored.ingredients,
    'a saved recipe opens and saves back unchanged, with or without amounts',
  );
}

// Near matches: an unmatched reading offers the closest names
{
  const { findNearMatches } =
    await import('../../src/apps/pinch/utils/catalogSearch.ts');
  const { resolveIngredients } =
    await import('../../src/apps/pinch/utils/resolveIngredient.ts');
  const amtCatalog = resolveIngredients([]);
  const amtNear = (name: string) =>
    findNearMatches(amtCatalog, name).map((ingredient) => ingredient.name);
  assert.deepEqual(
    amtNear('shredded lettuce'),
    ['Iceberg lettuce', 'Romaine lettuce'],
    'shredded lettuce offers the lettuces, not shredded coconut',
  );
  assert.deepEqual(
    amtNear('salt and pepper'),
    ['Black pepper', 'Salt', 'Cayenne pepper'],
    'an unsplit pair offers each half, the last word first',
  );
  assert.deepEqual(
    [amtNear('parmisan'), amtNear('and'), amtNear('')],
    [[], [], []],
    'a misspelling or a word that names nothing offers nothing',
  );
  assert.equal(
    findNearMatches(
      amtCatalog.filter(
        (ingredient) => ingredient.id !== 'cat-iceberg-lettuce',
      ),
      'shredded lettuce',
    ).some((ingredient) => ingredient.id === 'cat-iceberg-lettuce'),
    false,
    'an ingredient already in the recipe is not offered again',
  );
}

// ============================================================
// A name-only line carries its source
// ============================================================
{
  const sourced = (
    ingredientId: string,
    amount: number | null,
    unit: 'EACH' | 'TBSP',
    source: string | null,
  ) => ({ ingredientId, amount, unit, source }) as SourcedLine;
  const merged = srcMergeLines([
    sourced('cat-salt', null, 'EACH', 'meal:a'),
    sourced('cat-salt', null, 'EACH', 'meal:b'),
    sourced('cat-oil', 2, 'TBSP', 'meal:a'),
    sourced('cat-oil', null, 'EACH', 'meal:b'),
  ]);
  assert.deepEqual(
    merged.map((line) => [line.ingredientId, line.amount, line.sources]),
    [
      ['cat-salt', null, ['meal:a', 'meal:b']],
      ['cat-oil', 2, ['meal:a', 'meal:b']],
    ],
    'name-only lines from two meals stay one name-only item with both sources, and one that an amount of the same ingredient absorbs hands its source to that amount',
  );
}

// A name-only line carries its source
{
  const herb = (id: string, amount: number | null, unit: string) =>
    ({
      id,
      title: id,
      servings: 1,
      ingredients: [
        { id: 'l1', ingredientId: 'parsley', amount, unit, note: null },
      ],
    }) as unknown as Recipe;
  const parsley = new Map([
    ['parsley', { id: 'parsley', serving: { amount: 1, unit: 'G' } }],
  ]) as unknown as Map<string, ResolvedIngredient>;
  const recipes = new Map([
    ['plain', herb('plain', null, 'EACH')],
    ['measured', herb('measured', 30, 'G')],
  ]);
  const recipeMeal = (id: string, refId: string) =>
    srcPlanned(id, [{ id: `${id}-i`, kind: 'RECIPE', refId, servings: 1 }]);
  const day = srcDayOnList(
    [recipeMeal('m1', 'plain'), recipeMeal('m2', 'measured')],
    [
      {
        id: 'parsley__G',
        ingredientId: 'parsley',
        amount: 30,
        unit: 'G',
        isChecked: false,
        sources: ['m1', 'm2'],
        createdAt: 1,
        updatedAt: 1,
      } as ShoppingItem,
    ],
    recipes,
    parsley,
  );
  assert.deepEqual(
    [day.isListed, day.coveredCount, day.rowCount],
    [true, 1, 1],
    'a day whose name-only parsley sits beside a measured one is one row, and reads as on the list once the measured item carries both meals',
  );
}

// A name-only line joins the amount row of its ingredient in an add sheet
{
  const line = (
    ingredientId: string,
    amount: number | null,
    unit: 'EACH' | 'TSP' | 'G',
    source: string,
  ) => ({ ingredientId, amount, unit, source }) as SourcedLine;
  const ingredients = new Map([
    ['salt', { id: 'salt', name: 'Salt', serving: { amount: 1, unit: 'TSP' } }],
    ['oil', { id: 'oil', name: 'Oil', serving: { amount: 1, unit: 'TSP' } }],
  ]) as unknown as Map<string, ResolvedIngredient>;
  const rows = shopGroupLines(
    [
      line('salt', null, 'EACH', 'm1'),
      line('oil', null, 'EACH', 'm1'),
      line('salt', 0.5, 'TSP', 'm2'),
    ],
    ingredients,
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.lines.length]),
    [
      ['salt::VOLUME', 2],
      ['oil::COUNT', 1],
    ],
    'a name-only salt joins the salt row with an amount, and a name-only line alone keeps its own row',
  );
}

// What a shopping line is for is said by name; a stop takes one meal's share off the list
{
  const plannedOn = (
    id: string,
    dayKey: string,
    mealType: 'LUNCH' | 'DINNER',
    name: string | null,
    items: MealItem[],
  ) =>
    ({
      id,
      date: Date.parse(`${dayKey}T00:00:00Z`),
      mealType,
      name,
      items,
    }) as unknown as ShopPlannedMeal;
  const recipes = new Map([['rice-pot', srcRiceRecipe]]);
  const ingredients = new Map([
    [
      'rice',
      { id: 'rice', name: 'Rice', serving: { amount: 0.25, unit: 'CUP' } },
    ],
    ['salt', { id: 'salt', name: 'Salt', serving: { amount: 1, unit: 'TSP' } }],
  ]) as unknown as Map<string, ResolvedIngredient>;
  const many = Array.from({ length: 50 }, (_, index) =>
    plannedOn(`p${index}`, '2026-10-20', 'DINNER', `Plate ${index}`, []),
  );
  const planned = [
    plannedOn('thu', '2026-10-15', 'DINNER', null, [srcRecipeItem('a', 3)]),
    plannedOn('fri', '2026-10-16', 'DINNER', null, [srcRecipeItem('a', 3)]),
    plannedOn('thu-lunch', '2026-10-15', 'LUNCH', null, [
      srcRecipeItem('a', 3),
    ]),
    plannedOn('long-a', '2026-10-15', 'DINNER', 'Adobo chicken & 1 more', []),
    ...many,
  ];
  const allSources = planned.map((meal) => meal.id);
  const labels = stopLabels(
    [
      { sources: [...allSources, 'recipe:rice-pot'] },
    ] as unknown as ShoppingItem[],
    planned,
    recipes,
    new Map(),
    ingredients,
  );
  const textFor = (sources: string[]) => srcText(sources, labels, '2026-10-15');
  assert.deepEqual(
    [
      textFor(['fri']),
      textFor(['thu', 'fri']),
      textFor(['fri', 'recipe:rice-pot', 'thu-lunch']),
      textFor(many.map((meal) => meal.id)),
    ],
    [
      'Fri dinner',
      'Thu dinner and Fri dinner',
      'Thu lunch, Fri dinner and Rice pot',
      'Tue dinner (Plate 0), Tue dinner (Plate 1) and 48 more',
    ],
    'a row names its meals, up to three in full and then two and how many more (50 reads "and 48 more", never a bare count)',
  );
  assert.deepEqual(
    stopNames(['thu', 'thu-lunch', 'fri', 'long-a'], labels, '2026-10-15').map(
      ({ name }) => name,
    ),
    [
      'Thu lunch',
      'Thu dinner (Adobo chicken & 1 more)',
      'Thu dinner (Rice pot)',
      'Fri dinner',
    ],
    'the same recipe planned on two days or at two meals reads as two slots; two plates in one slot add their dish',
  );
  assert.deepEqual(
    [
      stopJoin(['A', 'B', 'C'], 2),
      stopJoin(['A', 'B', 'C', 'D'], 2),
      stopJoin(['A'], 2),
      stopJoin([], 2),
    ],
    ['A, B and C', 'A, B and 2 more', 'A', ''],
    'names join as a sentence; one past the limit is named, never "and 1 more"',
  );

  const doorMeals = (sources: string[]) =>
    stopMealsText(
      sources.map((source) => ({ label: labels.get(source)! })),
      '2026-10-15',
    );
  assert.deepEqual(
    [
      doorMeals(['thu', 'fri']),
      doorMeals(['thu-lunch', 'thu', 'recipe:rice-pot']),
      doorMeals(['thu', 'long-a', 'fri', ...many.map((meal) => meal.id)]),
    ],
    [
      'Thu dinner and Fri dinner',
      'Thu lunch, Thu dinner and Rice pot',
      'Thu dinner, Fri dinner and 50 more',
    ],
    'the door names the soonest meals and how many more, saying a slot two plates share once (two Thu dinners read "Thu dinner")',
  );

  const context = {
    plannedById: new Map(planned.map((meal) => [meal.id, meal])),
    mealsById: new Map([
      ['m1', { id: 'm1', name: 'Rice night', items: [srcRecipeItem('a', 6)] }],
    ]) as unknown as Map<string, SrcMeal>,
    recipesById: recipes,
    ingredientsById: ingredients,
  };
  assert.deepEqual(
    [
      stopSourceLines('recipe:rice-pot', context),
      stopSourceLines('thu', context),
      stopSourceLines('meal:m1', context)?.map((line) =>
        line.amount === null ? null : roundAmount(line.amount),
      ),
      stopSourceLines('gone', context),
      stopSourceLines('recipe:gone', context),
    ],
    [
      [{ ingredientId: 'rice', amount: 1, unit: 'CUP' }],
      [{ ingredientId: 'rice', amount: 1, unit: 'CUP', source: 'thu' }],
      [2, 0.01],
      null,
      null,
    ],
    'a source’s share is worked out the way its add was: a recipe at its own servings, a planned or saved meal’s items as they are now; one that no longer resolves has none',
  );

  const plate = plannedOn('plate', '2026-10-16', 'DINNER', null, [
    srcRecipeItem('a', 3),
    { id: 'b', kind: 'INGREDIENT', refId: 'rice', servings: 2 },
  ]);
  const named = plannedOn('named', '2026-10-17', 'DINNER', 'Rice night', [
    srcRecipeItem('a', 3),
    { id: 'b', kind: 'INGREDIENT', refId: 'rice', servings: 2 },
  ]);
  const parts = stopParts(
    [{ sources: ['plate', 'named', 'thu'] }] as unknown as ShoppingItem[],
    [plate, named, planned[0]],
    recipes,
    ingredients,
  );
  assert.deepEqual(
    [...parts.entries()].map(([id, byIngredient]) => [id, [...byIngredient]]),
    [['plate', [['salt', 'Rice pot']]]],
    'a line’s sheet names the dish of an unnamed plate that wants it (salt is only in the rice pot), and keeps the plate for one two dishes share, a named plate or a one-dish plate',
  );
  const rowItem = {
    id: 'rice__CUP',
    ingredientId: 'rice',
    amount: 3,
    unit: 'CUP',
    isChecked: false,
    sources: ['thu', 'recipe:rice-pot', 'plate', 'gone'],
    createdAt: 1,
    updatedAt: 1,
  } as ShoppingItem;
  const rowLabels = stopLabels(
    [rowItem],
    [...planned, plate],
    recipes,
    new Map(),
    ingredients,
  );
  assert.deepEqual(
    stopRowShares(
      [rowItem],
      [rowItem],
      rowLabels,
      {
        ...context,
        plannedById: new Map(
          [...planned, plate].map((meal) => [meal.id, meal]),
        ),
      },
      '2026-10-15',
      parts,
    ).map(({ name, dish, amount }) => [
      name,
      dish,
      amount && stopAmountText(amount),
    ]),
    [
      ['Thu dinner', 'Rice pot', '1 cup'],
      ['Fri dinner', 'Rice pot & Rice', '1.5 cup'],
      ['Rice pot', null, '1 cup'],
    ],
    'a line’s sheet lists every meal behind it with the dish and what each asks of it now (the plate’s rice pot and its own half cup of rice together), leaving out one that is gone',
  );

  const item = (
    ingredientId: string,
    unit: Unit,
    amount: number | null,
    sources: string[],
    isChecked = false,
  ): ShoppingItem => ({
    id: getShoppingItemId(ingredientId, unit),
    ingredientId,
    amount,
    unit,
    isChecked,
    sources,
    createdAt: 1,
    updatedAt: 1,
  });
  const shares = stopShares(
    'S',
    [
      { ingredientId: 'rice', amount: 1, unit: 'CUP' },
      { ingredientId: 'chicken', amount: 453.592, unit: 'G' },
      { ingredientId: 'salt', amount: null, unit: 'EACH' },
      { ingredientId: 'beans', amount: 2, unit: 'CUP' },
    ],
    [
      item('rice', 'CUP', 3, ['S', 'O']),
      item('chicken', 'LB', 2, ['S']),
      item('salt', 'EACH', null, ['S']),
      item('beans', 'CUP', 2, ['O']),
    ],
  );
  assert.deepEqual(
    [...shares.entries()].map(([id, amount]) => [id, roundAmount(amount)]),
    [
      ['rice__CUP', 1],
      ['chicken__LB', 1],
    ],
    'a share lands on the item of its unit, or on the same ingredient moved to another unit of the same kind (453.592 g is 1 lb); a name-only line and an item the source never filled take nothing',
  );

  const plan = (
    read: ShoppingItem[],
    shareMap: [string, number][],
    others: [string, number | null][],
  ) => stopPlan('S', read, new Map(shareMap), new Map(others), 99);
  const summary = (result: ReturnType<typeof plan>) => ({
    entries: result.entries.map(({ id, after }) => [
      id,
      after ? [after.amount, after.sources, after.isChecked] : null,
    ]),
    outcomes: result.entries.map(({ outcome }) => outcome),
  });

  assert.deepEqual(
    summary(
      plan(
        [
          item('chicken', 'LB', 2, ['S']),
          item('rice', 'CUP', 3, ['S', 'O']),
          item('garlic', 'EACH', 6, ['S'], true),
          item('parsley', 'EACH', null, ['S']),
          item('lime', 'EACH', null, ['S', 'O']),
          item('milk', 'L', 1.5, ['S']),
        ],
        [
          ['chicken__LB', 2],
          ['rice__CUP', 1],
          ['garlic__EACH', 6],
          ['milk__L', 1],
        ],
        [['rice__CUP', 2]],
      ),
    ),
    {
      entries: [
        ['garlic__EACH', [6, [], true]],
        ['lime__EACH', [null, ['O'], false]],
        ['parsley__EACH', null],
        ['chicken__LB', null],
        ['milk__L', [0.5, [], false]],
        ['rice__CUP', [2, ['O'], false]],
      ],
      outcomes: ['got', 'kept', 'removed', 'removed', 'reduced', 'kept'],
    },
    'stopping a meal deletes what was only for it, keeps another meal’s share of a shared line, leaves a got line ticked without the tag, deletes a name-only line nothing else wants and keeps what the person typed on top (milk 0.5 L, untagged, "reduced": nothing else needs it)',
  );
  assert.equal(
    summary(plan([item('bread', 'EACH', 1, [])], [], [])).entries.length,
    0,
    'something added on the list itself carries no source, so a stop never touches it',
  );
  assert.deepEqual(
    summary(
      plan(
        [
          item('chicken', 'LB', 1, ['S', 'O']),
          item('beef', 'LB', 1, ['S', 'G']),
          item('egg', 'EACH', 2, ['S', 'O']),
        ],
        [
          ['chicken__LB', 2],
          ['beef__LB', 2],
          ['egg__EACH', 2],
        ],
        [
          ['chicken__LB', 1.5],
          ['beef__LB', null],
          ['egg__EACH', 0],
        ],
      ),
    ).entries,
    [
      ['egg__EACH', [null, ['O'], false]],
      ['beef__LB', [1, ['G'], false]],
      ['chicken__LB', [1, ['O'], false]],
    ],
    'when the share runs past what is left, a line another meal wants keeps that meal’s share but never grows (1 lb, not 1.5), keeps its amount when that meal can’t be worked out, and an EACH line wanted only by name becomes just the name',
  );
  const toNameOnly = plan(
    [item('salt', 'TSP', 1, ['S', 'O'])],
    [['salt__TSP', 1]],
    [['salt__TSP', 0]],
  );
  const intoTwin = plan(
    [
      item('salt', 'TSP', 1, ['S', 'O']),
      { ...item('salt', 'EACH', null, ['X']), createdAt: 5 },
    ],
    [['salt__TSP', 1]],
    [['salt__TSP', 0]],
  );
  assert.deepEqual(
    [
      summary(toNameOnly),
      summary(intoTwin).entries,
      intoTwin.entries[1].before?.createdAt,
    ],
    [
      {
        entries: [
          ['salt__TSP', null],
          ['salt__EACH', [null, ['O'], false]],
        ],
        outcomes: ['kept', null],
      },
      [
        ['salt__TSP', null],
        ['salt__EACH', [null, ['X', 'O'], false]],
      ],
      5,
    ],
    'a measured line another meal wants only by name moves to that ingredient’s name-only line, created or merged into, with its old line gone',
  );

  const before = [
    item('chicken', 'LB', 2, ['S']),
    item('rice', 'CUP', 3, ['S', 'O']),
    item('garlic', 'EACH', 6, ['S'], true),
  ];
  const stopped = plan(
    before,
    [
      ['chicken__LB', 2],
      ['rice__CUP', 1],
    ],
    [['rice__CUP', 2]],
  );
  const store = new Map<string, ShoppingItem>(
    before.map((entry) => [entry.id, entry]),
  );
  stopped.entries.forEach(({ id, after }) =>
    after ? store.set(id, after) : store.delete(id),
  );
  store.set('rice__CUP', {
    ...store.get('rice__CUP')!,
    isChecked: true,
    updatedAt: 120,
  });
  const undone = stopped.entries.filter(({ id, after }) =>
    stopAsLeft(store.get(id) ?? null, after),
  );
  undone.forEach(({ id, before: was }) =>
    was ? store.set(id, was) : store.delete(id),
  );
  assert.deepEqual(
    [
      undone.map(({ id }) => id),
      [...store.values()].map((entry) => [
        entry.id,
        entry.amount,
        entry.isChecked,
      ]),
    ],
    [
      ['garlic__EACH', 'chicken__LB'],
      [
        ['rice__CUP', 2, true],
        ['garlic__EACH', 6, true],
        ['chicken__LB', 2, false],
      ],
    ],
    'an Undo puts back exactly what the stop wrote and skips a line changed since (rice ticked on another device keeps its tick)',
  );

  const listItems = [
    { ...item('chicken', 'LB', 2, ['fri', 'thu']), id: 'chicken__LB' },
    { ...item('chicken', 'OZ', 4, ['fri']), id: 'chicken__OZ' },
    item('rice', 'CUP', 1, ['fri', 'recipe:rice-pot'], true),
    item('salt', 'TSP', 1, ['thu-lunch']),
    item('beans', 'CUP', 1, ['gone']),
  ];
  const listLabels = stopLabels(
    listItems,
    planned,
    recipes,
    new Map(),
    ingredients,
  );
  assert.deepEqual(
    stopMeals(
      listItems,
      new Map(
        [...listLabels.entries()].map(([source, label]) => [
          source,
          {
            ...label,
            name: label.kind === 'planned' ? `Plan ${source}` : label.name,
          },
        ]),
      ),
      '2026-10-16',
    ).map((meal) => [meal.source, meal.openCount, meal.rowCount, meal.isPast]),
    [
      ['thu-lunch', 1, 1, true],
      ['thu', 1, 1, true],
      ['fri', 1, 2, false],
      ['recipe:rice-pot', 0, 1, false],
    ],
    'what the list is for runs by day and meal (the days that have passed first), then recipes and saved meals; a meal counts the rows the list draws (two units of chicken are one row) and a gone source is left out',
  );
}

// A recipe on the shopping list keeps the servings its add picked, so taking it off takes off exactly what it added
{
  const {
    addSources,
    countStopRows,
    getKeyShares,
    getOtherShares,
    getRecipeShoppingSource,
    getRowOnList,
    getShoppingMeals,
    getShoppingSourceLabels,
    getSourceLines,
    getSourceNames,
    getRowSourceShares,
    mergeSourcedLines,
    planStopShopping,
  } = await import('../../src/apps/pinch/utils/shopping.ts');
  const adobo = {
    id: 'adobo',
    title: 'Adobo chicken',
    servings: 4,
    ingredients: [
      { id: 'a1', ingredientId: 'thigh', amount: 2, unit: 'LB', note: null },
      { id: 'a2', ingredientId: 'soy', amount: 0.25, unit: 'CUP', note: null },
      { id: 'a3', ingredientId: 'soy', amount: 2, unit: 'TBSP', note: null },
      {
        id: 'a4',
        ingredientId: 'salt',
        amount: null,
        unit: 'EACH',
        note: 'to taste',
      },
    ],
  } as unknown as Recipe;
  const ingredients = new Map(
    ['thigh', 'soy', 'salt', 'cilantro', 'garlic'].map((id) => [
      id,
      { id, name: id, familyId: null, serving: { amount: 0.25, unit: 'CUP' } },
    ]),
  ) as unknown as Map<string, ResolvedIngredient>;
  const planned = (id: string, refId: string, servings: number) =>
    ({
      id,
      date: Date.parse('2026-10-16T00:00:00Z'),
      mealType: 'DINNER',
      name: null,
      items: [{ id: `${id}-i`, kind: 'INGREDIENT', refId, servings }],
    }) as unknown as ShopPlannedMeal;
  const plan = [
    planned('p1', 'cilantro', 0.5),
    planned('p2', 'cilantro', 0.5),
    planned('thu', 'soy', 1),
  ];
  const context = {
    plannedById: new Map(plan.map((meal) => [meal.id, meal])),
    mealsById: new Map() as Map<string, SrcMeal>,
    recipesById: new Map([['adobo', adobo]]),
    ingredientsById: ingredients,
  };
  const recipeAdd = (servings: number) =>
    getRecipeLines(adobo, ingredients, servings).map((line) => ({
      ...line,
      source: getRecipeShoppingSource('adobo', servings),
    }));
  const typed = (ingredientId: string, unit: Unit, amount: number) => [
    { ingredientId, unit, amount, source: null },
  ];
  type List = Map<string, ShoppingItem>;
  const add = (list: List, lines: SourcedLine[]): List =>
    mergeSourcedLines(lines).reduce((next, line) => {
      const id = getShoppingItemId(line.ingredientId, line.unit);
      const existing = next.get(id) ?? null;
      const fields = getMergedFields(existing, line, 1);
      return new Map(next).set(id, {
        id,
        ingredientId: line.ingredientId,
        unit: line.unit,
        createdAt: existing?.createdAt ?? 1,
        ...fields,
        sources: addSources(
          existing?.sources ?? [],
          line.sources,
          existing?.isChecked ?? false,
        ),
      });
    }, list);
  const stop = (list: List, key: string) => {
    const items = [...list.values()];
    const result = planStopShopping(
      key,
      items,
      getKeyShares(key, items, context) ?? new Map(),
      getOtherShares(key, items, context),
      2,
    );
    const after = result.entries.reduce(
      (next, { id, after: written }) =>
        written
          ? new Map(next).set(id, written)
          : new Map([...next].filter(([known]) => known !== id)),
      list,
    );
    return {
      after,
      rows: countStopRows(result.entries, items),
      outcomes: result.entries.map(({ outcome }) => outcome),
    };
  };
  const show = (list: List) =>
    [...list.values()]
      .map((item) => [item.id, item.amount, item.sources])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const empty: List = new Map();

  assert.deepEqual(
    [
      addSources([], ['recipe:adobo:8']),
      addSources(['recipe:adobo:4'], ['recipe:adobo:8']),
      addSources(['recipe:adobo:4'], ['recipe:adobo:4']),
      addSources(['recipe:adobo', 'thu'], ['recipe:adobo:6']),
      addSources(
        ['recipe:adobo:4', 'recipe:adobo', 'thu'],
        ['recipe:adobo:2'],
        true,
      ),
      addSources(['thu', 'fri'], ['thu']),
    ],
    [
      ['recipe:adobo:8'],
      ['recipe:adobo:12'],
      ['recipe:adobo:8'],
      ['recipe:adobo', 'thu', 'recipe:adobo:6'],
      ['thu', 'recipe:adobo:2'],
      ['fri', 'thu'],
    ],
    'an add keeps a recipe’s servings in step with the amount: 4 then 8 servings hold 12, the same 4 twice hold 8, an older entry with no servings stays beside a new one, a got line that starts again keeps only the new add, and a meal is still kept once',
  );
  assert.deepEqual(
    [
      getSourceLines('recipe:adobo:8', context)?.find(
        (line) => line.ingredientId === 'thigh',
      )?.amount,
      getSourceLines('recipe:adobo', context)?.find(
        (line) => line.ingredientId === 'thigh',
      )?.amount,
    ],
    [4, 2],
    'a recipe source is worked out at the servings its add kept, and an older one at the recipe’s own',
  );

  const stepper = stop(add(empty, recipeAdd(8)), 'recipe:adobo');
  assert.deepEqual(
    [
      show(stepper.after),
      stepper.rows,
      stepper.outcomes.every((outcome) => outcome === 'removed'),
    ],
    [[], { removed: 3, kept: 0, reduced: 0, left: 0 }, true],
    'a recipe added at 8 servings from the stepper (it serves 4) comes off whole: thigh, soy sauce (one row for a cup and two tbsp) and salt, three rows',
  );

  const legacy: List = new Map(
    [
      ['thigh', 'LB', 2],
      ['soy', 'CUP', 0.25],
      ['soy', 'TBSP', 2],
    ].map(([ingredientId, unit, amount]) => {
      const id = getShoppingItemId(ingredientId as string, unit as Unit);
      return [
        id,
        {
          id,
          ingredientId,
          unit,
          amount,
          isChecked: false,
          sources: ['recipe:adobo'],
          createdAt: 1,
          updatedAt: 1,
        } as ShoppingItem,
      ];
    }),
  );
  const onTop = add(legacy, recipeAdd(6));
  const repro = stop(onTop, 'recipe:adobo');
  assert.deepEqual(
    [
      show(onTop).find(([id]) => id === 'thigh__LB'),
      show(repro.after),
      repro.rows,
    ],
    [
      ['thigh__LB', 5, ['recipe:adobo', 'recipe:adobo:6']],
      [],
      { removed: 3, kept: 0, reduced: 0, left: 0 },
    ],
    'the reviewer’s case: a list from before servings were kept (Adobo at its own 4) plus an add at 6 comes off whole, with nothing left untagged',
  );

  const twice = add(add(empty, recipeAdd(4)), recipeAdd(8));
  const twiceStopped = stop(twice, 'recipe:adobo');
  assert.deepEqual(
    [show(twice).find(([id]) => id === 'thigh__LB'), show(twiceStopped.after)],
    [['thigh__LB', 6, ['recipe:adobo:12']], []],
    'two adds of one recipe at different servings (4, then 8) hold 12 servings and come off together',
  );

  const withTyped = add(add(empty, typed('soy', 'CUP', 1)), recipeAdd(4));
  const typedStopped = stop(withTyped, 'recipe:adobo');
  assert.deepEqual(
    [show(typedStopped.after), typedStopped.rows],
    [[['soy__CUP', 1, []]], { removed: 2, kept: 0, reduced: 1, left: 0 }],
    'what the person typed stays when the recipe comes off, untagged, and the soy sauce row is said to have gone down, not to be needed by something else',
  );

  const shared = add(add(empty, recipeAdd(4)), [
    { ingredientId: 'soy', unit: 'TBSP', amount: 2, source: 'thu' },
  ]);
  const sharedStopped = stop(shared, 'recipe:adobo');
  assert.deepEqual(
    [show(sharedStopped.after), sharedStopped.rows],
    [[['soy__TBSP', 2, ['thu']]], { removed: 2, kept: 1, reduced: 0, left: 0 }],
    'a line that still has another source is the only one said to be needed by something else',
  );

  const roundingLine = (amount: number) =>
    planStopShopping(
      'S',
      [
        {
          id: 'x__CUP',
          ingredientId: 'x',
          unit: 'CUP',
          amount,
          isChecked: false,
          sources: ['S'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      new Map([['x__CUP', 2]]),
      new Map(),
      2,
    ).entries.map(({ after, outcome }) => [after?.amount ?? null, outcome]);
  assert.deepEqual(
    [roundingLine(2.02), roundingLine(2.05)],
    [[[null, 'removed']], [[0.05, 'reduced']]],
    'a hundredth or two left by rounding the adds is nothing, while more than that stays',
  );

  const keyed = [
    {
      id: 'thigh__LB',
      ingredientId: 'thigh',
      unit: 'LB',
      amount: 2,
      isChecked: false,
      sources: ['recipe:adobo:4'],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'soy__CUP',
      ingredientId: 'soy',
      unit: 'CUP',
      amount: 0.75,
      isChecked: true,
      sources: ['recipe:adobo', 'recipe:adobo:8'],
      createdAt: 1,
      updatedAt: 1,
    },
  ] as ShoppingItem[];
  const keyedLabels = getShoppingSourceLabels(
    keyed,
    plan,
    context.recipesById,
    new Map(),
    ingredients,
  );
  assert.deepEqual(
    [
      [...keyedLabels.keys()],
      getShoppingMeals(keyed, keyedLabels, '2026-10-16').map(
        ({ source, rowCount }) => [source, rowCount],
      ),
      getSourceNames(
        ['recipe:adobo:4', 'recipe:adobo', 'recipe:adobo:8'],
        keyedLabels,
        '2026-10-16',
      ),
      getRowOnList(
        recipeAdd(8).filter((line) => line.ingredientId === 'thigh'),
        [keyed[0]],
      ).isCovered,
    ],
    [
      ['recipe:adobo'],
      [['recipe:adobo', 2]],
      [{ source: 'recipe:adobo', name: 'Adobo chicken' }],
      true,
    ],
    'one recipe added at different servings is one meal on the list, named once, and a second add sees it already there',
  );

  const cilantro = {
    id: 'cilantro__CUP',
    ingredientId: 'cilantro',
    unit: 'CUP',
    amount: 0.25,
    isChecked: false,
    sources: ['p1', 'p2'],
    createdAt: 1,
    updatedAt: 1,
  } as ShoppingItem;
  const cilantroLabels = getShoppingSourceLabels(
    [cilantro],
    plan,
    context.recipesById,
    new Map(),
    ingredients,
  );
  const rowShares = (row: ShoppingItem[]) =>
    getRowSourceShares(
      row,
      row,
      getShoppingSourceLabels(
        row,
        plan,
        context.recipesById,
        new Map(),
        ingredients,
      ),
      context,
      '2026-10-15',
      new Map(),
    ).map(({ amount }) => amount && [amount.amount, amount.unit]);
  const garlic = (id: string) => planned(id, 'garlic', 3);
  context.plannedById.set('g1', garlic('g1'));
  context.plannedById.set('g2', garlic('g2'));
  plan.push(garlic('g1'), garlic('g2'));
  ingredients.set('garlic', {
    id: 'garlic',
    name: 'garlic',
    familyId: null,
    serving: { amount: 0.25, unit: 'EACH' },
  } as unknown as ResolvedIngredient);
  const garlicItem = {
    id: 'garlic__EACH',
    ingredientId: 'garlic',
    unit: 'EACH',
    amount: 1.5,
    isChecked: false,
    sources: ['g1', 'g2'],
    createdAt: 1,
    updatedAt: 1,
  } as ShoppingItem;
  assert.deepEqual(
    [cilantroLabels.size, rowShares([cilantro]), rowShares([garlicItem])],
    [
      2,
      [
        [0.13, 'CUP'],
        [0.12, 'CUP'],
      ],
      [
        [1, 'EACH'],
        [1, 'EACH'],
      ],
    ],
    'a row’s shares add up to its amount: two halves of 0.25 cup read 0.13 and 0.12, and two 0.75 counts read 1 and 1 under the 2 to pick up',
  );
}

// Ingredient groups: one order everywhere, an ingredient in several groups, and the form's moves
{
  const {
    getRepeatedLineGroups,
    groupIngredientLines,
    orderIngredientLines,
    placeLineInGroup,
    renameLineGroup,
    restoreLineGroup,
    ungroupLines,
  } = await import('../../src/apps/pinch/utils/ingredientGroups.ts');
  const { getDataFromExtracted, getInitialData, toRecipeLine } =
    await import('../../src/apps/pinch/components/recipes/recipeFormModel.ts');
  const { resolveIngredients } =
    await import('../../src/apps/pinch/utils/resolveIngredient.ts');
  const grp = (
    id: string,
    ingredientId: string,
    group: string | null,
    amount: number | null = 1,
    unit: Unit = 'TBSP',
  ) => ({ id, ingredientId, amount, unit, note: null, group });
  const ids = (lines: { id: string }[]) => lines.map((line) => line.id);
  const heads = (lines: { group?: string | null }[]) =>
    groupIngredientLines(lines).map((group) => [
      group.name,
      group.lines.length,
    ]);
  const adoboGroups = [
    grp('thigh', 'chicken', 'For the chicken', 2, 'LB'),
    grp('soy1', 'soy', 'For the chicken', 4),
    grp('soy2', 'soy', 'For the sauce', 2),
    grp('salt', 'salt', null, null, 'EACH'),
    grp('garlic2', 'garlic', 'for the  SAUCE', 2, 'EACH'),
    grp('garlic1', 'garlic', 'For the chicken', 4, 'EACH'),
  ];

  assert.deepEqual(
    [heads(adoboGroups), ids(orderIngredientLines(adoboGroups))],
    [
      [
        [null, 1],
        ['For the chicken', 3],
        ['For the sauce', 2],
      ],
      ['salt', 'thigh', 'soy1', 'garlic1', 'soy2', 'garlic2'],
    ],
    'lines with no group come first with no heading, then each group in the order its first line appears, and two spellings of one name are one group',
  );
  const legacyLines = [
    { id: 'a', ingredientId: 'x', amount: 1, unit: 'TBSP', note: null },
    grp('b', 'y', null),
    grp('c', 'z', '   '),
  ];
  assert.deepEqual(
    [heads(legacyLines), ids(orderIngredientLines(legacyLines))],
    [[[null, 3]], ['a', 'b', 'c']],
    'a recipe with no groups (keys missing, null or blank) is one block with no heading, in its own order',
  );
  assert.deepEqual(
    [...getRepeatedLineGroups(adoboGroups)].sort(),
    [
      ['garlic1', 'For the chicken'],
      ['garlic2', 'For the sauce'],
      ['soy1', 'For the chicken'],
      ['soy2', 'For the sauce'],
    ],
    'a line away from its heading is labelled with its group only when its ingredient sits in more than one group',
  );

  const ordered = orderIngredientLines(adoboGroups);
  const moved = placeLineInGroup(ordered, {
    ...ordered[0],
    group: 'For the chicken',
  });
  const fresh = placeLineInGroup(ordered, grp('lime', 'lime', 'Garnish'));
  const ungroupedNew = placeLineInGroup(ordered, grp('rice', 'rice', null));
  assert.deepEqual(
    [ids(moved), ids(fresh), ids(ungroupedNew)],
    [
      ['thigh', 'soy1', 'garlic1', 'salt', 'soy2', 'garlic2'],
      ['salt', 'thigh', 'soy1', 'garlic1', 'soy2', 'garlic2', 'lime'],
      ['salt', 'rice', 'thigh', 'soy1', 'garlic1', 'soy2', 'garlic2'],
    ],
    'a line moved or added to a group goes to the end of it, a new group goes last, and no group joins the lines at the top',
  );
  const merged = renameLineGroup(ordered, 'For the sauce', 'for the chicken');
  const respelled = renameLineGroup(ordered, 'For the sauce', 'FOR THE SAUCE');
  assert.deepEqual(
    [heads(merged), heads(respelled)],
    [
      [
        [null, 1],
        ['For the chicken', 5],
      ],
      [
        [null, 1],
        ['For the chicken', 3],
        ['FOR THE SAUCE', 2],
      ],
    ],
    "renaming a group to another group's name makes them one, keeping that group's spelling; renaming to its own name in other letters respells it",
  );
  const ungrouped = ungroupLines(ordered, 'For the chicken');
  const editedSince = ungrouped.filter((line) => line.id !== 'soy2');
  assert.deepEqual(
    [
      heads(ungrouped),
      ids(restoreLineGroup(ungrouped, ordered, 'For the chicken')),
      ids(restoreLineGroup(editedSince, ordered, 'For the chicken')),
    ],
    [
      [
        [null, 4],
        ['For the sauce', 2],
      ],
      ids(ordered),
      ['salt', 'thigh', 'soy1', 'garlic1', 'garlic2'],
    ],
    'removing a group keeps its lines with no group, and Undo puts the group back where it was without bringing back a line removed since',
  );

  const steps = [
    'Marinate the chicken with soy sauce and garlic.',
    'Simmer with more soy sauce and garlic.',
    'Add the garlic and serve.',
  ];
  const stepLines = ordered.map((line) => ({
    id: line.id,
    ingredientId: line.ingredientId,
    group: line.group,
    names: [
      { chicken: 'Chicken thigh', soy: 'Soy sauce', salt: 'Salt' }[
        line.ingredientId
      ] ?? 'Garlic',
    ],
  }));
  const { matchStepIngredients: matchGrouped } =
    await import('../../src/apps/pinch/utils/stepIngredients.ts');
  assert.deepEqual(
    [
      matchGrouped(steps, stepLines).map((step) => step.lineIds),
      matchGrouped([steps[0]], stepLines).map((step) => step.lineIds),
      matchGrouped(
        ['Mix the soy sauce.', 'Add soy sauce.'],
        [
          { id: 's1', ingredientId: 'soy', group: 'A', names: ['Soy sauce'] },
          { id: 's2', ingredientId: 'soy', group: 'B', names: ['Soy sauce'] },
          { id: 's3', ingredientId: 'soy', group: 'C', names: ['Soy sauce'] },
        ],
      ).map((step) => step.lineIds),
    ],
    [
      [['thigh', 'soy1', 'garlic1'], ['soy2', 'garlic2'], []],
      [['thigh', 'soy1', 'soy2', 'garlic1', 'garlic2']],
      [['s1'], ['s2', 's3']],
    ],
    "each step that names an ingredient in several groups takes the next group's line, the last one takes what is left, and a later mention takes nothing",
  );

  const cooked = { ...baseRecipe, ingredients: ordered };
  assert.deepEqual(
    [
      getRecipeChanges(
        cooked,
        { ...cooked, ingredients: ungroupLines(ordered, 'For the chicken') },
        new Map(),
      ),
      getRecipeChanges(
        cooked,
        {
          ...cooked,
          ingredients: placeLineInGroup(ordered, {
            ...ordered[2],
            group: 'For the sauce',
          }),
        },
        new Map(),
      ),
      getRecipeChanges(
        cooked,
        {
          ...cooked,
          ingredients: [
            ...ordered.filter((line) => line.id !== 'soy2'),
            grp('soy3', 'soy', 'For the sauce', 3),
          ],
        },
        new Map([['soy', { name: 'Soy sauce' }]]),
      ),
    ],
    [
      [],
      [],
      [
        'Added Soy sauce (for the SAUCE), 3 tbsp',
        'Removed Soy sauce (For the sauce)',
      ],
    ],
    'moving lines between groups (to the front or the end of one) records no tweak, and a change to an ingredient in several groups names its group',
  );

  const read = getDataFromExtracted(
    {
      title: 'Adobo',
      servings: 4,
      prepMinutes: null,
      cookMinutes: null,
      description: null,
      ingredients: [
        { name: 'soy sauce', amount: 2, unit: 'TBSP', note: null, group: null },
        {
          name: 'soy sauce',
          amount: 4,
          unit: 'TBSP',
          note: null,
          group: 'For the chicken',
        },
        {
          name: 'soy sauce',
          amount: 1,
          unit: 'TBSP',
          note: null,
          group: 'For the chicken',
        },
        {
          name: 'garlic',
          amount: 2,
          unit: 'EACH',
          note: null,
          group: 'For the sauce',
        },
        {
          name: 'soy sauce',
          amount: 2,
          unit: 'TBSP',
          note: null,
          group: 'For the sauce',
        },
        {
          name: 'jasmine rice',
          amount: 1,
          unit: 'CUP',
          note: null,
          group: null,
        },
      ],
      steps: [],
      care: null,
      unread: [],
    },
    resolveIngredients([]),
  );
  assert.deepEqual(
    read.ingredients.map((row) => [row.ingredientId, row.amount, row.group]),
    [
      ['cat-soy-sauce', '2', null],
      ['cat-jasmine-rice', '1', null],
      ['cat-soy-sauce', '5', 'For the chicken'],
      ['cat-garlic', '2', 'For the sauce'],
      ['cat-soy-sauce', '2', 'For the sauce'],
    ],
    'a reading adds a second line of one ingredient into the first only under the same heading, and lists the rows in group order',
  );
  const legacyStored = {
    ...shopRecipe('legacy', 4, []),
    ingredients: [
      { id: 'a', ingredientId: 'x', amount: 1, unit: 'TBSP', note: null },
    ],
  } as unknown as Recipe;
  assert.deepEqual(
    getInitialData(legacyStored).ingredients.map(toRecipeLine),
    [
      {
        id: 'a',
        ingredientId: 'x',
        amount: 1,
        unit: 'TBSP',
        note: null,
        group: null,
      },
    ],
    'a line saved before groups opens with no group and saves back with `group: null`',
  );

  const soyIngredients = new Map([
    [
      'soy',
      shopIngredient('soy', 'Soy sauce', null, { amount: 1, unit: 'TBSP' }),
    ],
  ]);
  const twoGroupRecipe = {
    ...shopRecipe('twoGroups', 4, []),
    ingredients: [grp('g1', 'soy', 'A', 4), grp('g2', 'soy', 'B', 2)],
  } as Recipe;
  assert.deepEqual(
    getRecipeLines(twoGroupRecipe, soyIngredients),
    [{ ingredientId: 'soy', amount: 6, unit: 'TBSP' }],
    "one ingredient's lines in two groups are one line on the shopping list",
  );
}

console.log('pinchMath: all checks passed');
