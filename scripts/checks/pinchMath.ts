import assert from 'node:assert/strict';

import {
  getEntryGrams,
  getServingGrams,
  scaleNutrition,
  toPer100g,
} from '../../src/apps/pinch/utils/nutritionBasis.ts';
import { scaleAmount } from '../../src/apps/pinch/utils/quantity.ts';
import {
  countLeftOutIngredients,
  countUnaskedIngredients,
} from '../../src/apps/pinch/utils/gaps.ts';
import { formatRowCost } from '../../src/apps/pinch/utils/mealFormat.ts';
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
  getPlannedCookId,
  getPlannedCookedAt,
  groupCooksByRecipe,
  isCookHistoryFull,
  isValidCookServings,
  mergePlannedCook,
} from '../../src/apps/pinch/utils/cooks.ts';
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
  Cook,
  Idea,
  MealItem,
  Gap,
  Product,
  Recipe,
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

console.log('pinchMath: all checks passed');
