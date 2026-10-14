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
  getItemsLines,
  getRecipeLines,
  getShoppingCost,
  getShoppingItemId,
  groupShoppingItems,
  mergeLines,
} from '../../src/apps/pinch/utils/shopping.ts';
import type {
  MealItem,
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
  [{ ingredientId: 'rice', amount: 1, unit: 'CUP' }],
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

console.log('pinchMath: all checks passed');
