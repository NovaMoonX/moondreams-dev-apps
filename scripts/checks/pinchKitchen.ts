import assert from 'node:assert/strict';

import { CATALOG_STORES } from '../../src/apps/pinch/catalog/catalogStores.ts';
import type { IngredientRecord, Store } from '../../src/apps/pinch/types.ts';
import { searchIngredients } from '../../src/apps/pinch/utils/catalogSearch.ts';
import {
  getCatalogOverrides,
  getIngredientAdjustments,
} from '../../src/apps/pinch/utils/ingredientAdjustments.ts';
import { matchIngredient } from '../../src/apps/pinch/utils/ingredientMatch.ts';
import {
  cleanAliases,
  getRecordAliases,
  mergeAlias,
} from '../../src/apps/pinch/utils/ingredientRecord.ts';
import {
  findStoreForLink,
  normalizeExtractedProduct,
} from '../../src/apps/pinch/utils/normalizeProduct.ts';
import { getProductReadFailureLine } from '../../src/apps/pinch/utils/readFailures.ts';
import { resolveIngredients } from '../../src/apps/pinch/utils/resolveIngredient.ts';
import { CATALOG_INGREDIENTS_BY_ID } from '../../src/apps/pinch/catalog/index.ts';

const record = (overrides: Partial<IngredientRecord>): IngredientRecord => ({
  id: 'c-ranch',
  catalogId: null,
  name: 'Dry ranch seasoning powder',
  familyId: null,
  iconKey: null,
  nutritionPer100g: null,
  servingAmount: null,
  servingUnit: null,
  gramsPerMl: null,
  gramsEach: null,
  aliases: [],
  defaultProductId: null,
  isArchived: false,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

// aliases: cleaned the way they are saved
assert.deepEqual(
  cleanAliases(
    [
      '  Ranch Salad  Dressing & Recipe Mix ',
      'ranch salad dressing & recipe mix',
      '',
      '   ',
      'Dry ranch seasoning powder',
      'Ranch packet',
    ],
    'Dry ranch seasoning powder',
  ),
  ['Ranch Salad Dressing & Recipe Mix', 'Ranch packet'],
  'trimmed, spaces collapsed, no blanks, no repeats ignoring case, never the ingredient own name',
);
assert.equal(
  cleanAliases(
    Array.from({ length: 25 }, (_, index) => `Name ${index}`),
    'Other',
  ).length,
  10,
  'at most ten other names',
);
assert.equal(cleanAliases(['x'.repeat(300)], null)[0].length, 120);

// aliases: a document written before them has no key and reads as none
const legacy = record({});
delete (legacy as Partial<IngredientRecord>).aliases;
assert.deepEqual(getRecordAliases(legacy), []);
assert.deepEqual(getRecordAliases(null), []);
assert.doesNotThrow(() => resolveIngredients([legacy]));

// aliases: a person's own ingredient answers to them in search and in a reading
const ingredients = resolveIngredients([
  record({ aliases: ['Ranch Salad Dressing & Recipe Mix'] }),
]);
const ranch = ingredients.find((ingredient) => ingredient.id === 'c-ranch');
assert.deepEqual(ranch?.aliases, ['Ranch Salad Dressing & Recipe Mix']);
assert.equal(
  matchIngredient('Ranch Salad Dressing & Recipe Mix', ingredients)?.id,
  'c-ranch',
  'a recipe naming the ingredient by its other name is that ingredient',
);
assert.equal(
  searchIngredients(ingredients, 'salad dressing mix')[0]?.id,
  'c-ranch',
  'search finds it by a word of its other name',
);

// aliases: a catalog ingredient keeps its built-in names and adds the person's, without repeating one
const catalog = CATALOG_INGREDIENTS_BY_ID.get('cat-chicken-breast');
assert.ok(catalog, 'the catalog has chicken breast');
const [builtIn] = catalog.aliases;
const adjusted = resolveIngredients([
  record({
    id: 'cat-chicken-breast',
    catalogId: 'cat-chicken-breast',
    name: null,
    aliases: ['Poultry cutlet', ...(builtIn ? [builtIn.toUpperCase()] : [])],
  }),
]).find((ingredient) => ingredient.id === 'cat-chicken-breast');
assert.deepEqual(
  adjusted?.aliases,
  [...catalog.aliases, 'Poultry cutlet'],
  "the person's names follow the built-in ones, and one the catalog has is not listed twice",
);
assert.equal(
  adjusted?.isAdjusted,
  true,
  'a name of their own is an adjustment',
);
assert.equal(
  getIngredientAdjustments(
    catalog,
    record({
      id: 'cat-chicken-breast',
      catalogId: 'cat-chicken-breast',
      name: null,
      aliases: ['Poultry cutlet'],
    }),
    () => null,
  ).some((adjustment) => adjustment.key === 'aliases'),
  true,
  'the Adjusted list says which names are theirs',
);

// a saved built-in ingredient keeps only what differs from its built-in values
const chicken = CATALOG_INGREDIENTS_BY_ID.get('cat-chicken-breast');
assert.ok(chicken);
assert.deepEqual(
  getCatalogOverrides(chicken, chicken.per100g, chicken.serving),
  { nutrition: null, serving: null },
  'an alias-only save copies no built-in numbers or serving',
);
assert.deepEqual(
  getCatalogOverrides(
    chicken,
    { ...chicken.per100g, protein: chicken.per100g.protein + 1 },
    chicken.serving,
  ),
  {
    nutrition: {
      calories: null,
      protein: chicken.per100g.protein + 1,
      carbs: null,
      fat: null,
    },
    serving: null,
  },
  'only the changed number is kept',
);
assert.deepEqual(
  getCatalogOverrides(chicken, null, { amount: 7, unit: 'OZ' }).serving,
  { amount: 7, unit: 'OZ' },
);

// products: a reading is cleaned to what the form accepts
assert.deepEqual(
  normalizeExtractedProduct({
    brand: ' Great Value ',
    price: 0.88,
    sizeAmount: 1,
    sizeUnit: 'OZ',
    unread: ['the page shows no unit price'],
  }),
  {
    label: 'Great Value',
    priceCents: 88,
    sizeAmount: 1,
    sizeUnit: 'OZ',
    alias: null,
    unread: ['the page shows no unit price'],
  },
);
assert.equal(
  normalizeExtractedProduct({ price: 4.995 }).priceCents,
  500,
  'dollars become whole cents',
);
assert.equal(normalizeExtractedProduct({ price: 0.29 }).priceCents, 29);
assert.deepEqual(
  normalizeExtractedProduct({ price: -3, sizeAmount: 0, sizeUnit: 'OZ' }),
  {
    label: null,
    priceCents: null,
    sizeAmount: null,
    sizeUnit: null,
    alias: null,
    unread: [],
  },
  'a price or size that is not a positive amount is unread',
);
assert.deepEqual(
  normalizeExtractedProduct({ sizeAmount: 12, sizeUnit: 'CT' }),
  {
    label: null,
    priceCents: null,
    sizeAmount: null,
    sizeUnit: null,
    alias: null,
    unread: [],
  },
  'a size in a unit the app does not know is no size',
);
assert.deepEqual(
  normalizeExtractedProduct({ sizeAmount: 12, sizeUnit: null }).sizeAmount,
  null,
  'a size with no unit is no size',
);
assert.equal(normalizeExtractedProduct('not an object').priceCents, null);
assert.equal(
  normalizeExtractedProduct({
    brand: `${'Great '.repeat(40)}Value`,
  }).label?.endsWith(' '),
  false,
);
assert.equal(
  normalizeExtractedProduct({
    unread: Array.from({ length: 20 }, (_, index) => `note ${index}`),
  }).unread.length,
  5,
  'a few unread notes at most',
);

// products: a general name is kept only when it really is one
const ctx = {
  knownNames: ['Dry ranch seasoning powder', 'Ranch packet'],
  title: 'Great Value Classic Ranch Salad Dressing & Recipe Mix, 1 oz',
};
const aliasOf = (alias: unknown, brand: string | null = 'Great Value') =>
  normalizeExtractedProduct({ brand, alias }, ctx).alias;
assert.equal(
  aliasOf('Ranch Salad Dressing & Recipe Mix'),
  'Ranch Salad Dressing & Recipe Mix',
  'a generalization of the product name is offered',
);
assert.equal(aliasOf(ctx.title), null, 'never the whole product name');
assert.equal(
  aliasOf('Great Value Ranch Salad Dressing Mix'),
  null,
  'never with the brand in it',
);
assert.equal(aliasOf('Ranch Dressing Mix, 1 oz'), null, 'never with a size');
assert.equal(aliasOf('Ranch Dressing Mix 12 ct'), null, 'never with a count');
assert.equal(
  aliasOf('dry ranch seasoning powder'),
  null,
  "never the ingredient's own name, ignoring case",
);
assert.equal(
  aliasOf('Ranch packets'),
  null,
  'nor one of its names in the plural',
);
assert.equal(aliasOf('   '), null);
assert.equal(aliasOf(42), null);
assert.equal(aliasOf('Ranch Salad Dressing & Recipe Mix', null) !== null, true);

// aliases: adding one name to an ingredient
assert.deepEqual(mergeAlias(['A'], 'B', ['Own']), ['A', 'B']);
assert.equal(mergeAlias(['A'], 'a', ['Own']), null, 'a repeat is not added');
assert.equal(mergeAlias([], 'own', ['Own']), null, 'its own name is not added');
assert.equal(
  mergeAlias([], 'Boneless skinless chicken breast', [
    'Chicken breast',
    'boneless skinless chicken breast',
  ]),
  null,
  'a built-in name is not added again',
);
assert.equal(
  mergeAlias(
    Array.from({ length: 10 }, (_, index) => `Name ${index}`),
    'One more',
    [],
  ),
  null,
  'a full list takes no more',
);

// products: the store a page is on
const walmart = CATALOG_STORES.find((store) => store.domain === 'walmart.com');
assert.ok(walmart, 'the catalog has Walmart');
const ownWalmart: Store = {
  id: 'own-walmart',
  name: 'Walmart',
  catalogStoreId: walmart.id,
  imagePath: null,
  isArchived: false,
  createdAt: 0,
  updatedAt: 0,
};
const link =
  'https://www.walmart.com/ip/Great-Value-Classic-Ranch-Salad-Dressing-Recipe-Mix-1-oz/187211086?classType=VARIANT&athbdg=L1100&from=/search';
assert.deepEqual(findStoreForLink(link, [ownWalmart]), {
  storeId: 'own-walmart',
  suggestedName: null,
});
assert.deepEqual(
  findStoreForLink(link, []),
  {
    storeId: null,
    suggestedName: 'Walmart',
  },
  'a well-known store the person lacks is named, never added',
);
assert.deepEqual(
  findStoreForLink(link, [{ ...ownWalmart, isArchived: true }]),
  { storeId: null, suggestedName: 'Walmart' },
  'a hidden store is not picked for them',
);
assert.deepEqual(
  findStoreForLink('https://grocery.walmart.com/ip/1', [ownWalmart]),
  {
    storeId: 'own-walmart',
    suggestedName: null,
  },
  'a subdomain is the same store',
);
assert.deepEqual(
  findStoreForLink('https://notwalmart.com/ip/1', [ownWalmart]),
  { storeId: null, suggestedName: null },
  'a look-alike domain is not the store',
);
assert.deepEqual(findStoreForLink('not a link', [ownWalmart]), {
  storeId: null,
  suggestedName: null,
});

// products: a failed reading names its cause and says the price can be typed
const lines = (
  ['unreachable', 'busy', 'unavailable', 'link', 'unread', 'empty'] as const
).map((cause) => getProductReadFailureLine(cause));
assert.equal(new Set(lines).size, lines.length);
assert.equal(
  /link|page|price/i.test(lines[0]),
  false,
  'a line about the connection never blames the page',
);
assert.equal(
  lines.filter((line) => /type (it|the price) in below/i.test(line)).length,
  4,
  'when the page is the trouble, the form is the way forward',
);

console.log('pinchKitchen: all checks passed');
