import assert from 'node:assert/strict';

import {
  getEntryGrams,
  getServingGrams,
  scaleNutrition,
  toPer100g,
} from '../../src/apps/pinch/utils/nutritionBasis.ts';
import { scaleAmount } from '../../src/apps/pinch/utils/quantity.ts';
import { getRecipeCost } from '../../src/apps/pinch/utils/recipeMath.ts';
import {
  getComparableUrl,
  getWebLinkHost,
  hasSeveralWebLinks,
  toWebLink,
} from '../../src/utils/urlUtils.ts';
import {
  getCookFactText,
  getCookId,
  getCookServings,
  getCookSummaries,
  getMarkableRecipes,
  getMissingCookFields,
  getPlannedCookedAt,
  groupCooksByRecipe,
  isCookHistoryFull,
  isValidCookServings,
  mergePlannedCook,
} from '../../src/apps/pinch/utils/cooks.ts';
import {
  getCookChoiceLabels,
  getMissingNoteFields,
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
  getIdeaSearchText,
  getMissingIdeaFields,
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
import type {
  Cook,
  Idea,
  MealItem,
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
  care: null,
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

const careOf = (parts: Partial<Parameters<typeof toCare>[0] & object>) =>
  toCare({
    fridgeDays: null,
    freezerDays: null,
    reheat: null,
    tip: null,
    ...parts,
  });
assert.deepEqual(
  changesFor({ care: careOf({ fridgeDays: 3 }) }),
  ['Fridge storage set to 3 days'],
  'a fridge time added reads as set',
);
assert.deepEqual(
  getRecipeChanges(
    { ...baseRecipe, care: careOf({ fridgeDays: 3, freezerDays: 90 }) },
    {
      ...baseRecipe,
      care: careOf({
        fridgeDays: 5,
        freezerDays: 90,
        reheat: 'Warm it gently.',
      }),
    },
    names,
  ),
  ['Fridge storage 3 days → 5 days', 'Added reheating directions'],
  'a changed fridge time shows both values and an added reheating line is named, an unchanged freezer is not',
);
assert.deepEqual(
  getRecipeChanges(
    {
      ...baseRecipe,
      care: careOf({ freezerDays: 90, tip: 'Keep the sauce apart.' }),
    },
    baseRecipe,
    names,
  ),
  ['Freezer storage removed', 'Removed the storage tip'],
  'taking care away is named part by part',
);
assert.deepEqual(
  getRecipeChanges(
    {
      ...baseRecipe,
      care: careOf({ freezerDays: 30, reheat: 'Oven.', tip: 'A.' }),
    },
    {
      ...baseRecipe,
      care: careOf({ freezerDays: 60, reheat: 'Microwave.', tip: 'B.' }),
    },
    names,
  ),
  [
    'Freezer storage 1 month → 2 months',
    'Reheating directions changed',
    'Storage tip changed',
  ],
  'months read as months and a changed reheating line or tip says only that it changed',
);
assert.deepEqual(
  getRecipeChanges(
    { ...baseRecipe, care: undefined } as unknown as RecipeContent,
    baseRecipe,
    names,
  ),
  [],
  'a recipe from before care existed (no key) and one with care null are the same',
);
assert.deepEqual(
  getRecipeChanges(
    baseRecipe,
    {
      ...baseRecipe,
      care: { fridgeDays: null, freezerDays: null, reheat: '  ', tip: null },
    },
    names,
  ),
  [],
  'a care record with nothing in it is no care',
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
  (r) => ({
    ...r,
    care: toCare({ ...r.care, fridgeDays: (r.care?.fridgeDays ?? 2) + 1 }),
  }),
  (r) => ({
    ...r,
    care: toCare({
      ...r.care,
      tip: r.care?.tip ? null : 'Keep the sauce apart.',
    }),
  }),
  (r) => ({ ...r, care: toCare({ ...r.care, reheat: 'Warm it gently.' }) }),
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

// Recipe care: the pure parts the form, the drawer, the Finish panel and the readers share.
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

assert.equal(getCareSummary(null), '', 'no care has no summary');
assert.equal(
  getCareSummary(toCare({ fridgeDays: 3, freezerDays: 90 })),
  'Fridge 3 days, freezer 3 months',
  'the summary names each time',
);
assert.equal(
  getCareSummary(toCare({ fridgeDays: 1, reheat: 'Oven.', tip: 'Apart.' })),
  'Fridge 1 day, reheating, tip',
  'reheating and a tip are named, not copied',
);
assert.equal(
  getCareSummary(toCare({ tip: 'Apart.' })),
  'Tip',
  'a tip alone is just Tip',
);
assert.equal(
  getCareSummary(toCare({ freezerDays: 60, tip: 'Apart.' })),
  'Freezer 2 months, tip',
  'the first word is capitalised whichever part comes first',
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

console.log('pinchMath: all checks passed');
