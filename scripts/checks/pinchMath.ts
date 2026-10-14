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
import {
  countLeftOutIngredients,
  countUnaskedIngredients,
} from '../../src/apps/pinch/utils/gaps.ts';
import {
  formatRowCost,
  getFixedNote,
  getRepriceLines,
} from '../../src/apps/pinch/utils/mealFormat.ts';
import { getRecipeNutrition } from '../../src/apps/pinch/utils/nutritionMath.ts';
import { getRecipeCost } from '../../src/apps/pinch/utils/recipeMath.ts';
import {
  getComparableUrl,
  getWebLinkHost,
  hasSeveralWebLinks,
  toWebLink,
} from '../../src/utils/urlUtils.ts';
import {
  CONTAINER_EVENT_KINDS,
  MAX_CONTAINER_HISTORY,
  MAX_CONTAINER_NOTE_LENGTH,
  MAX_CONTAINER_SERVINGS,
  MAX_CONTAINER_TITLE_LENGTH,
  MAX_EAT_BY_DATE,
  MIN_EAT_BY_DATE,
} from '../../src/apps/pinch/constants.ts';
import {
  appendEvent,
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
  getPutAwayServings,
  getPutAwayText,
  getSavedText,
  getServingsToEat,
  getShoppingStockLine,
  getStockDetail,
  getStockDueText,
  getStockMaps,
  getStockParts,
  getStockPlaceCounts,
  getStockTitle,
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
} from '../../src/apps/pinch/utils/containers.ts';
import {
  getCookFactText,
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
  ResolvedFamily,
  ResolvedIngredient,
  ShoppingItem,
  Unit,
} from '../../src/apps/pinch/types.ts';

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
const shopFamilies = [
  { id: 'fam-chicken', name: 'Chicken', isCustom: false },
  { id: 'fam-rice', name: 'Rice', isCustom: false },
] as ResolvedFamily[];
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
  shopIngredients,
  shopFamilies,
);
assert.deepEqual(
  grouped.groups.map((group) => [
    group.name,
    group.rows.map((row) => row.name),
  ]),
  [
    ['Chicken', ['Chicken', 'Chicken']],
    ['Rice', ['Rice']],
    ['Other', ['Chips', 'Removed ingredient', 'Salt']],
  ],
  'groups follow the family order, and an ingredient with no family or an unknown one, or one that is gone, lands in Other',
);
assert.deepEqual(
  grouped.groups[0].rows.map((row) => row.unit),
  ['LB', 'OZ'],
  'one ingredient in two units is two rows',
);
assert.deepEqual(
  grouped.checked.map((row) => row.id),
  ['rice__LB'],
  'a checked item is in "Got it", not in its group',
);

const heldItems = [
  shopItem('rice', 'CUP', 1, true),
  shopItem('salt', 'TSP', 1, false),
  shopItem('chips', 'G', 28, true),
];
const heldGrouped = groupShoppingItems(
  heldItems,
  shopIngredients,
  shopFamilies,
  new Map([
    ['rice__CUP', false],
    ['salt__TSP', true],
  ]),
);
assert.deepEqual(
  heldGrouped.groups.map((group) => [
    group.name,
    group.rows.map((row) => [row.id, row.isChecked]),
  ]),
  [['Rice', [['rice__CUP', true]]]],
  'a row just ticked stays in its group, still carrying its stored checked flag',
);
assert.deepEqual(
  heldGrouped.checked.map((row) => [row.id, row.isChecked]),
  [
    ['chips__G', true],
    ['salt__TSP', false],
  ],
  'a row just unticked stays in "Got it" until it is let go, and the unheld rows follow the stored flag',
);
assert.deepEqual(
  groupShoppingItems(heldItems, shopIngredients, shopFamilies, new Map()),
  groupShoppingItems(heldItems, shopIngredients, shopFamilies),
  'an empty hold changes nothing',
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
assert.equal(
  getCookFactText(3, 'Oct 12'),
  'Cooked 3 times · last Oct 12',
  'the fact line for several cooks',
);
assert.equal(
  getCookFactText(1, 'Oct 12'),
  'Cooked once · Oct 12',
  'the fact line for one cook',
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
  getRepriceLines(
    { beforeCents: null, afterCents: 66.0285, leftOutCount: 0 },
    false,
  ),
  { before: "Wasn't priced", after: 'about $0.66', leftOut: null },
  "an unpriced day says Wasn't priced, the result says about, nothing unpriced adds no line",
);
assert.equal(
  getRepriceLines(
    { beforeCents: null, afterCents: null, leftOutCount: 1 },
    true,
  ).before,
  'Still no price',
  'a day already priced again says Still no price',
);
assert.deepEqual(
  getRepriceLines(
    { beforeCents: 1066.4, afterCents: null, leftOutCount: 2 },
    false,
  ),
  {
    before: '$10.66',
    after: 'Still no price',
    leftOut: '2 ingredients still have no price',
  },
  'a priced day shows its total as the tile does, a result with no price says so, and the count is plural',
);
assert.equal(
  getRepriceLines({ beforeCents: 0, afterCents: 99.6, leftOutCount: 1 }, false)
    .leftOut,
  '1 ingredient still has no price',
  'one ingredient is singular',
);
assert.equal(
  getRepriceLines({ beforeCents: 0, afterCents: 99.6, leftOutCount: 1 }, false)
    .before,
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

assert.equal(formatRowCost(null, false), 'No price yet');
assert.equal(formatRowCost(undefined, false), 'No price yet');
assert.equal(
  formatRowCost(null, true),
  "Wasn't priced",
  'a frozen day says it was not priced, not that it has no price yet',
);
assert.equal(
  formatRowCost(null, true, true),
  'Still no price',
  'an unpriced item on a day that was priced again says so',
);
assert.equal(formatRowCost(15.4, true), '$0.15');
assert.equal(formatRowCost(0, false), '$0.00', 'a known free item is priced');

const gap = (kind: Gap['kind'], ingredientId: string) =>
  ({ kind, ingredientId }) as Gap;
const leftOutOnDay = [
  gap('NO_PRODUCT', 'garlic'),
  gap('NO_PRODUCT', 'garlic'),
  gap('NO_PRODUCT', 'vinegar'),
  gap('NOT_COMPARABLE', 'soy'),
  gap('NO_PRODUCT', 'rice'),
];
const stillOpen = leftOutOnDay.filter((entry) => entry.ingredientId !== 'rice');
assert.equal(
  countLeftOutIngredients(leftOutOnDay),
  4,
  'an ingredient in several meals counts once',
);
assert.equal(
  countUnaskedIngredients(leftOutOnDay, stillOpen, {}),
  1,
  'an ingredient only in a day that has passed is left out but not asked about',
);
assert.equal(
  countUnaskedIngredients(leftOutOnDay, stillOpen, {
    'NO_PRODUCT:vinegar': 1,
  }),
  2,
  'a hidden note takes its ingredient off the note but not off the total',
);
assert.equal(
  countUnaskedIngredients(leftOutOnDay, stillOpen, { 'NO_PRODUCT:soy': 1 }),
  1,
  'an ingredient whose package size is still open stays in the note when only its price note was hidden',
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
  ['PAST', 'PAST', 'SOON', 'SOON', 'SOON', 'LATER', 'LATER'],
  'eat soon is today and the next two days, past its date is any day before today',
);
assert.deepEqual(
  [13, 14, 15, 17, 18].map((day) => getEatByState(dayOf(day), earlyOnThe15th)),
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

const fromCook = buildContainer(
  {
    id: 'c2',
    title: '  Adobo chicken ',
    recipeId: 'adobo',
    mealId: null,
    cookId: 'cook-1',
    servings: 4,
    place: 'FREEZER',
    eatBy: dayOf(30),
  },
  8000,
);
assert.deepEqual(
  [
    fromCook.history.map((entry) => entry.kind),
    fromCook.title,
    fromCook.status,
  ],
  [['MADE', 'FREEZE'], 'Adobo chicken', 'IN_STOCK'],
  'a container from a cook starts with MADE, then where it went',
);
assert.deepEqual(
  buildContainer(
    { ...fromCook, cookId: null, place: 'FRIDGE' },
    8000,
  ).history.map((entry) => entry.kind),
  ['FRIDGE'],
  'any other container starts with where it went',
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
  { fridge: 2, freezer: 4, containers: 3, nearestEatBy: dayOf(12) },
  'one pass sums a recipe across containers and places and keeps its nearest eat-by',
);
assert.equal(
  maps.byRecipe.has('rice'),
  false,
  'a finished container is not stock',
);
assert.deepEqual(
  maps.byMeal.get('meal-1'),
  { fridge: 2, freezer: 0, containers: 1, nearestEatBy: dayOf(16) },
  'a saved meal has its own stock',
);
assert.equal(
  maps.byRecipe.size + maps.byMeal.size,
  2,
  'a typed container belongs to no recipe or meal',
);
const adoboStock = maps.byRecipe.get('adobo')!;
assert.deepEqual(
  getStockParts(adoboStock),
  [
    { place: 'FRIDGE', servings: 2 },
    { place: 'FREEZER', servings: 4 },
  ],
  'fridge first, then freezer, each only above zero',
);
assert.deepEqual(
  getStockParts({
    fridge: 0,
    freezer: 3,
    containers: 1,
    nearestEatBy: dayOf(30),
  }),
  [{ place: 'FREEZER', servings: 3 }],
);
assert.equal(
  getStockDueText(adoboStock, lateOnThe14th),
  'past its date',
  'the nearest eat-by being behind today says so',
);
assert.equal(
  getStockDueText({ ...adoboStock, nearestEatBy: dayOf(15) }, lateOnThe14th),
  'eat by tomorrow',
);
assert.equal(
  getStockDueText({ ...adoboStock, nearestEatBy: dayOf(30) }, lateOnThe14th),
  null,
  'a far eat-by adds nothing to the row',
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
    soonCount: 2,
    pastCount: 1,
  },
  'the Kitchen row counts servings by place, containers, those to eat soon and those past their date; finished ones are left out',
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
  ['2 to eat soon, 1 past its date', '1 to eat soon', '2 past their date', ''],
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
  [
    getPutAwayServings(8, null),
    getPutAwayServings(8, 4),
    getPutAwayServings(4, 4),
    getPutAwayServings(3, null),
    getPutAwayServings(0.5, null),
    getPutAwayServings(500, null),
    getPutAwayServings(7.5, 2),
  ],
  [6, 4, 1, 1, 1, 100, 5],
  'what is left after tonight, as whole portions, at least one and at most 100',
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
  ],
  [
    null,
    'You already have 3 servings in the freezer.',
    'You already have 2 servings of Adobo in the fridge.',
    'You already have 5 servings (2 in the fridge and 3 in the freezer).',
    'You already have 2 servings of Adobo (1 in the fridge and 1 in the freezer).',
    'You already have prepared servings of Adobo and Rice.',
  ],
  'the shopping sheet says what is already put away, in one line, and never subtracts it',
);
assert.equal(
  getSavedText(
    { servings: 4, place: 'FREEZER', eatBy: dayOf(16) },
    lateOnThe14th,
  ),
  'Saved 4 servings in the freezer, eat by ' +
    getEatByPhrase(dayOf(16), lateOnThe14th),
);
assert.equal(
  getSavedText(
    { servings: 1, place: 'FRIDGE', eatBy: dayOf(15) },
    lateOnThe14th,
  ),
  'Saved 1 serving in the fridge, eat by tomorrow',
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
const byCook = groupContainersByCook([
  container({
    id: 'a',
    cookId: 'k1',
    servings: 4,
    history: [makeEvent('MADE', 1, { servings: 4 })],
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
  'a cook says how many servings were put away across its containers',
);
assert.equal(getPutAwayText([]), null);

console.log('pinchMath: all checks passed');
