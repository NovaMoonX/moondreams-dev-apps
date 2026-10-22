import baseAssert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAX_MEAL_ITEMS,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_IMPORTED_TIPS,
  MAX_RECIPE_LINKS,
  MAX_SHARED_MEAL_LINES,
  MAX_SHARED_MEAL_RECIPES,
} from '../../src/apps/pinch/constants.ts';
import type {
  IngredientRecord,
  Meal,
  SharedIngredient,
  SharedMeal,
  SharedMealItem,
  SharedRecipe,
} from '../../src/apps/pinch/types.ts';
import {
  EMPTY_MEAL_PROBLEM,
  MAX_IMPORT_WRITES,
  NO_INGREDIENTS_PROBLEM,
  TOO_BIG_PROBLEM,
  UNDO_BLOCKED_PROBLEM,
  getAddedMessage,
  getCoverTargets,
  getUndoneMessage,
  getWritten,
  mapIngredients,
  planMealImport,
  planRecipeImport,
  planUndo,
  type ShareImportPlan,
  type UndoSurvey,
} from '../../src/apps/pinch/utils/importShare.ts';

const state = { passed: 0 };
const counted =
  <Args extends unknown[]>(check: (...args: Args) => void) =>
  (...args: Args) => {
    check(...args);
    state.passed += 1;
  };
const assert: typeof baseAssert = Object.assign(counted(baseAssert), {
  equal: counted(baseAssert.equal),
  notEqual: counted(baseAssert.notEqual),
  deepEqual: counted(baseAssert.deepEqual),
  ok: counted(baseAssert.ok),
}) as typeof baseAssert;

const rules = readFileSync(
  new URL('../../firestore.rules', import.meta.url),
  'utf8',
);

const getRuleKeys = (fn: string, kind: 'hasOnly' | 'hasAll') => {
  const start = rules.indexOf(`function ${fn}(`);
  const body = rules.slice(start, rules.indexOf('\n      }\n', start));
  const match = new RegExp(
    `data\\.keys\\(\\)\\.${kind}\\(\\[([^\\]]*)\\]\\)`,
  ).exec(body);
  return (match?.[1].match(/'([^']+)'/g) ?? []).map((key) => key.slice(1, -1));
};

const NOW = 1_700_000_000_000;
const makeCounter = () => {
  const state = { next: 0 };
  return () => `id-${++state.next}`;
};

const line = (
  name: string,
  overrides: Partial<SharedIngredient> = {},
): SharedIngredient => ({
  name,
  catalogId: null,
  amount: 1,
  unit: 'CUP',
  note: null,
  group: null,
  ...overrides,
});

const recipeOf = (
  title: string,
  ingredients: SharedIngredient[],
  overrides: Partial<SharedRecipe> = {},
): SharedRecipe => ({
  title,
  description: null,
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  ingredients,
  steps: ['Mix it.', 'Cook it.'],
  care: null,
  links: [],
  tips: [],
  hasCover: false,
  ...overrides,
});

const own = (
  id: string,
  name: string,
  isArchived = false,
): IngredientRecord => ({
  id,
  catalogId: null,
  name,
  familyId: null,
  iconKey: null,
  nutritionPer100g: null,
  servingAmount: null,
  servingUnit: null,
  gramsPerMl: null,
  gramsEach: null,
  defaultProductId: null,
  isArchived,
  createdAt: 1,
  updatedAt: 1,
});

const getPlan = (result: {
  plan: ShareImportPlan | null;
  problem: string | null;
}) => {
  assert.equal(result.problem, null);
  assert.ok(result.plan);
  return result.plan;
};

const ids = (plan: ShareImportPlan) => ({
  recipes: plan.recipes.map((entry) => entry.recipe.id),
  ingredients: plan.ingredients.map((ingredient) => ingredient.id),
});

// ---- The mapping: a catalog id is kept, then the person's own, then one new ingredient per name ----
{
  const records = [
    own('own-gochujang', 'Gochujang'),
    own('own-mirin', 'Mirin', true),
  ];
  const result = mapIngredients(
    [
      { name: 'Chicken thighs', catalogId: 'cat-chicken-thigh' },
      {
        name: 'whatever the sharer renamed it',
        catalogId: 'cat-chicken-breast',
      },
      { name: 'GOCHUJANG', catalogId: null },
      { name: 'gochujangs', catalogId: null },
      { name: 'Chicken breast', catalogId: null },
      { name: 'boneless chicken thighs', catalogId: null },
      { name: 'Sumac', catalogId: null },
      { name: 'sumac', catalogId: 'cat-not-in-this-catalog' },
      { name: 'Mirin', catalogId: null },
      { name: 'fresh Sumac', catalogId: null },
    ],
    records,
    NOW,
    makeCounter(),
  );
  assert.equal(
    result.getId({ name: 'Chicken thighs', catalogId: 'cat-chicken-thigh' }),
    'cat-chicken-thigh',
    'a cat- id the catalog has is kept',
  );
  assert.equal(
    result.getId({ name: 'renamed', catalogId: 'cat-chicken-breast' }),
    'cat-chicken-breast',
    'the id wins over a name the sharer changed',
  );
  assert.equal(
    result.getId({ name: 'GOCHUJANG', catalogId: null }),
    'own-gochujang',
    "a custom name matches the person's own ingredient ignoring case",
  );
  assert.equal(
    result.getId({ name: 'gochujangs', catalogId: null }),
    'own-gochujang',
    'and ignoring a plural',
  );
  assert.equal(
    result.getId({ name: 'Chicken breast', catalogId: null }),
    'cat-chicken-breast',
    'a name the catalog has maps to the catalog',
  );
  assert.equal(
    result.getId({ name: 'boneless chicken thighs', catalogId: null }),
    'cat-chicken-thigh',
    'by alias too',
  );
  const sumacIds = new Set(
    ['Sumac', 'sumac', 'fresh Sumac'].map((name) =>
      result.getId({ name, catalogId: null }),
    ),
  );
  assert.equal(
    sumacIds.size,
    1,
    'one unknown name is one ingredient however it is spelled',
  );
  assert.equal(
    result.getId({ name: 'sumac', catalogId: 'cat-not-in-this-catalog' }),
    [...sumacIds][0],
    'a cat- id the catalog lacks falls back to the name',
  );
  assert.deepEqual(
    result.created.map((record) => record.name).sort(),
    ['Mirin', 'Sumac'],
    'a hidden (archived) ingredient is not matched, and each unknown name is made once',
  );
  assert.ok(
    result.created.every(
      (record) =>
        record.catalogId === null &&
        record.isArchived === false &&
        record.createdAt === NOW &&
        record.updatedAt === NOW &&
        Object.values(record).every((value) => value !== undefined),
    ),
  );
}

// ---- A recipe: every key, no sharer data, lines kept as written ----
{
  const shared = recipeOf(
    '  Sunday sauce  ',
    [
      line('Chicken thigh', {
        catalogId: 'cat-chicken-thigh',
        amount: 1.5,
        unit: 'LB',
        note: 'cut small',
      }),
      line('Salt', {
        amount: null,
        unit: 'CUP',
        note: 'to taste',
        group: 'For the sauce',
      }),
      line('Harissa', {
        amount: null,
        unit: 'TBSP',
        note: null,
        group: '  for  the sauce ',
      }),
      line('Gochujang', { amount: 2, unit: 'TBSP', group: 'For the sauce' }),
      line('Mystery spice', { amount: 0, unit: 'NOT_A_UNIT' as never }),
    ],
    {
      description: 'x'.repeat(MAX_RECIPE_DESCRIPTION_LENGTH + 40),
      servings: 0,
      prepMinutes: 12.4,
      cookMinutes: -5,
      steps: ['  Brown it.  ', '', '   ', 'Simmer.'],
      care: {
        fridgeDays: 3,
        freezerDays: 9999,
        reheat: ' low and slow ',
        tip: null,
      },
      links: [
        { kind: 'HOW_TO', label: ' Watch ', url: 'https://example.com/watch' },
        { kind: 'OTHER', label: null, url: 'javascript:alert(1)' },
        { kind: 'HOW_TO', label: null, url: 'https://example.com/second' },
      ],
      hasCover: true,
    },
  );
  const plan = getPlan(
    planRecipeImport(
      shared,
      [own('own-gochujang', 'gochujang')],
      NOW,
      makeCounter(),
    ),
  );
  const [{ recipe, shareIndex, hasCover }] = plan.recipes;
  assert.equal(plan.recipes.length, 1);
  assert.equal(plan.meal, null);
  assert.equal(shareIndex, 0);
  assert.equal(hasCover, true);

  const keys = Object.keys(recipe).sort();
  assert.deepEqual(
    keys,
    [
      'id',
      'title',
      'description',
      'servings',
      'prepMinutes',
      'cookMinutes',
      'coverPath',
      'coverUrl',
      'ingredients',
      'steps',
      'nutritionOverride',
      'source',
      'sourceId',
      'care',
      'collectionIds',
      'categories',
      'links',
      'isArchived',
      'isFavorite',
      'createdAt',
      'updatedAt',
    ].sort(),
    'a new recipe has every key of the type',
  );
  const allowed = getRuleKeys('isRecipe', 'hasOnly');
  const required = getRuleKeys('isRecipe', 'hasAll');
  assert.ok(allowed.length > 0 && required.length > 0, 'the rules were read');
  assert.ok(
    keys.every((key) => allowed.includes(key)),
    'every key is one the rules allow',
  );
  assert.ok(
    required.every((key) => keys.includes(key)),
    'every key the rules require is there',
  );
  assert.ok(
    Object.values(recipe).every((value) => value !== undefined),
    'no undefined, only null',
  );
  assert.equal(recipe.title, 'Sunday sauce');
  assert.equal(recipe.description?.length, MAX_RECIPE_DESCRIPTION_LENGTH);
  assert.equal(recipe.servings, 1, 'servings above zero');
  assert.equal(recipe.prepMinutes, 12, 'whole minutes');
  assert.equal(recipe.cookMinutes, null, 'a negative time is none');
  assert.deepEqual(
    recipe.steps,
    ['Brown it.', 'Simmer.'],
    'blank steps are dropped',
  );
  assert.deepEqual(
    recipe.care,
    { fridgeDays: 3, freezerDays: null, reheat: 'low and slow', tip: null },
    'care is cleaned like a form save',
  );
  assert.deepEqual(
    recipe.links.map((link) => [link.kind, link.label, link.url]),
    [
      ['HOW_TO', 'Watch', 'https://example.com/watch'],
      ['OTHER', null, 'https://example.com/second'],
    ],
    'a link that is not a web address is dropped and a second how-to is a plain link',
  );
  assert.ok(recipe.links.length <= MAX_RECIPE_LINKS);
  assert.equal(recipe.source, 'MANUAL');
  assert.equal(recipe.sourceId, null);
  assert.equal(recipe.coverPath, null);
  assert.equal(recipe.coverUrl, null);
  assert.equal(recipe.nutritionOverride, null);
  assert.deepEqual(recipe.collectionIds, []);
  assert.equal(recipe.isArchived, false);
  assert.equal(recipe.isFavorite, false);
  assert.deepEqual(
    recipe.categories,
    [],
    'a share carries no categories, so an imported recipe starts with none',
  );
  assert.equal(recipe.createdAt, NOW);
  assert.equal(recipe.updatedAt, NOW);
  assert.ok(
    recipe.ingredients.length >= 1 &&
      recipe.ingredients.length <= MAX_RECIPE_INGREDIENTS,
  );

  const [thigh, salt, harissa, gochujang, mystery] = recipe.ingredients;
  assert.deepEqual(
    [thigh.ingredientId, thigh.amount, thigh.unit, thigh.note, thigh.group],
    ['cat-chicken-thigh', 1.5, 'LB', 'cut small', null],
    'a measured line is kept as written',
  );
  assert.deepEqual(
    [salt.ingredientId, salt.amount, salt.unit, salt.note, salt.group],
    ['cat-salt', null, 'EACH', 'to taste', 'For the sauce'],
    'an amountless line stays amountless, in EACH, with its words and its group',
  );
  assert.equal(
    harissa.group,
    'for the sauce',
    'a group is cleaned as the form cleans it',
  );
  assert.equal(harissa.note, null);
  assert.equal(
    gochujang.ingredientId,
    'own-gochujang',
    "matched to the person's own ingredient",
  );
  assert.equal(mystery.amount, null, 'an amount of zero is none');
  assert.equal(mystery.unit, 'EACH', 'and an unknown unit is each');
  assert.equal(
    new Set(recipe.ingredients.map((entry) => entry.id)).size,
    recipe.ingredients.length,
    'every row has its own id',
  );
  assert.deepEqual(
    plan.ingredients.map((ingredient) => ingredient.name).sort(),
    ['Harissa', 'Mystery spice'],
    'only the names nothing matched are made, and a catalog name (Salt) is not',
  );

  const ingredientKeys = getRuleKeys('isIngredient', 'hasOnly');
  const ingredientRequired = getRuleKeys('isIngredient', 'hasAll');
  assert.ok(
    plan.ingredients.every((ingredient) => {
      const own = Object.keys(ingredient);
      return (
        own.every((key) => ingredientKeys.includes(key)) &&
        ingredientRequired.every((key) => own.includes(key)) &&
        ingredient.name !== null &&
        ingredient.name.length >= 1 &&
        ingredient.name.length <= 120
      );
    }),
    "a made ingredient passes the rules' shape",
  );
  assert.deepEqual(
    getCoverTargets(plan),
    [{ index: 0, recipeId: recipe.id }],
    'a recipe with a shared cover is a cover to copy',
  );
}

// ---- A recipe with nothing to cook with, and a brand-new kitchen ----
{
  const none = planRecipeImport(recipeOf('Empty', []), [], NOW, makeCounter());
  assert.equal(none.plan, null);
  assert.equal(none.problem, NO_INGREDIENTS_PROBLEM);

  const fresh = getPlan(
    planRecipeImport(
      recipeOf('Fresh start', [line('Rice'), line('Sumac'), line('Zaatar')]),
      [],
      NOW,
      makeCounter(),
    ),
  );
  assert.equal(
    fresh.recipes[0].recipe.ingredients.length,
    3,
    'a kitchen with no records at all still gets every line',
  );
  assert.ok(
    fresh.ingredients.length >= 2,
    'and makes what the catalog does not have',
  );
}

// ---- Tips come with the recipe, as the new recipe's own ----
{
  const tips = [
    { text: 'Pat it dry.', step: 1 },
    { text: 'Make it a day ahead.', step: null },
    { text: 'Gone.', step: 7 },
    { text: '   ', step: 0 },
  ];
  const plan = getPlan(
    planRecipeImport(
      recipeOf('Tipped', [line('Salt')], { tips }),
      [],
      NOW,
      makeCounter(),
    ),
  );
  const [entry] = plan.recipes;
  assert.equal(entry.tips.length, 3, 'a blank tip is not written');
  entry.tips.forEach((tip) => {
    assert.equal(tip.recipeId, entry.recipe.id, 'each tip belongs to the new recipe');
    assert.equal(tip.kind, 'TIP');
    assert.equal(tip.cookId, null);
    assert.deepEqual(tip.changes, []);
    assert.equal(tip.reason, null);
  });
  const tipKeys = Object.keys(entry.tips[0]);
  assert.ok(
    tipKeys.every((key) => getRuleKeys('isRecipeNote', 'hasOnly').includes(key)),
    'an imported tip has only keys the notes rule allows',
  );
  assert.ok(
    getRuleKeys('isRecipeNote', 'hasAll').every((key) => tipKeys.includes(key)),
    'and every key the rule requires',
  );
  assert.equal(entry.tips[0].stepIndex, 1);
  assert.equal(entry.tips[0].stepText, 'Cook it.', 'a tip finds its step again by its words');
  assert.equal(entry.tips[1].stepIndex, null);
  assert.equal(entry.tips[2].stepIndex, null, 'a step the recipe lacks reads as the whole recipe');
  assert.equal(new Set(entry.tips.map((tip) => tip.id)).size, 3);

  const old = { ...recipeOf('Old', [line('Salt')]) } as Partial<SharedRecipe>;
  delete old.tips;
  assert.equal(
    getPlan(planRecipeImport(old as SharedRecipe, [], NOW, makeCounter())).recipes[0].tips.length,
    0,
    'a copy made before tips existed brings none',
  );

  const written = getWritten(plan, []);
  assert.deepEqual(
    written.tips.map((tip) => tip.id).sort(),
    entry.tips.map((tip) => tip.id).sort(),
  );
  const recipeStored = new Map([[entry.recipe.id, { updatedAt: entry.recipe.updatedAt, ingredientIds: [] as string[] }]]);
  const undo = planUndo(written, {
    recipes: recipeStored,
    meals: new Map(),
    ingredients: new Map(),
    usedIds: new Set<string>(),
  });
  assert.equal(undo.problem, null);
  if (undo.problem !== null) throw new Error('unreachable');
  assert.deepEqual([...undo.tipIds].sort(), entry.tips.map((tip) => tip.id).sort(), 'Undo takes back the tips with their recipe');
}

{
  const manyTips = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ text: `Tip ${index}`, step: null }));
  const plan = getPlan(
    planMealImport(
      {
        name: 'Tipped meal',
        recipes: [0, 1, 2].map((index) =>
          recipeOf(`R${index}`, [line(`Thing ${index}`)], { tips: manyTips(70) }),
        ),
        items: [0, 1, 2].map((index): SharedMealItem => ({ kind: 'RECIPE', servings: 1, recipeIndex: index })),
      },
      [],
      NOW,
      makeCounter(),
    ),
  );
  assert.deepEqual(
    plan.recipes.map((entry) => entry.tips.length),
    [70, 70, MAX_IMPORTED_TIPS - 140],
    'the first recipes keep their tips and the last one gets what is left of the cap',
  );
}

// ---- A meal: each recipe once, items pointing at what was written ----
{
  const soup = recipeOf(
    'Soup',
    [line('Chicken breast'), line('Sumac'), line('Leek')],
    { hasCover: true },
  );
  const salad = recipeOf('Salad', [line('sumac'), line('Zaatar')]);
  const unused = recipeOf('Never on the plate', [line('Quince')]);
  const items: SharedMealItem[] = [
    { kind: 'RECIPE', servings: 2, recipeIndex: 0 },
    { kind: 'RECIPE', servings: 1.5, recipeIndex: 1 },
    { kind: 'RECIPE', servings: 3, recipeIndex: 0 },
    { kind: 'INGREDIENT', servings: 1, name: 'SUMAC', catalogId: null },
    {
      kind: 'INGREDIENT',
      servings: 2,
      name: 'Bread',
      catalogId: 'cat-chicken-thigh',
    },
    { kind: 'RECIPE', servings: 1, recipeIndex: 9 },
    { kind: 'RECIPE', servings: 0, recipeIndex: 1 },
  ];
  const shared: SharedMeal = {
    name: '  Sunday dinner ',
    recipes: [soup, salad, unused],
    items,
  };
  const plan = getPlan(planMealImport(shared, [], NOW, makeCounter()));
  const meal = plan.meal as Meal;

  assert.ok(meal);
  assert.equal(meal.name, 'Sunday dinner');
  assert.equal(meal.isFavorite, false);
  assert.deepEqual(meal.categories, [], 'and so does an imported saved meal');
  assert.equal(meal.createdAt, NOW);
  assert.deepEqual(
    plan.recipes.map((entry) => [
      entry.recipe.title,
      entry.shareIndex,
      entry.hasCover,
    ]),
    [
      ['Soup', 0, true],
      ['Salad', 1, false],
    ],
    'each recipe on the plate is written once, and one nothing uses is not written',
  );
  assert.equal(
    meal.items.length,
    5,
    'an item with no such recipe or no servings is dropped',
  );
  assert.deepEqual(
    meal.items.map((item) => [item.kind, item.servings]),
    [
      ['RECIPE', 2],
      ['RECIPE', 1.5],
      ['RECIPE', 3],
      ['INGREDIENT', 1],
      ['INGREDIENT', 2],
    ],
    'kinds and servings are kept as shared',
  );
  const recipeIds = new Set(plan.recipes.map((entry) => entry.recipe.id));
  assert.equal(
    meal.items[0].refId,
    meal.items[2].refId,
    'two items for one recipe point at the one written recipe',
  );
  assert.ok(
    recipeIds.has(meal.items[0].refId) && recipeIds.has(meal.items[1].refId),
  );
  assert.notEqual(meal.items[0].refId, meal.items[1].refId);
  assert.equal(
    meal.items[4].refId,
    'cat-chicken-thigh',
    'an ingredient item keeps a catalog id',
  );

  const sumac = plan.ingredients.filter(
    (ingredient) => ingredient.name === 'Sumac',
  );
  assert.equal(sumac.length, 1, 'one new Sumac across two recipes and an item');
  assert.equal(
    plan.recipes[0].recipe.ingredients[1].ingredientId,
    sumac[0].id,
    'the first recipe uses it',
  );
  assert.equal(
    plan.recipes[1].recipe.ingredients[0].ingredientId,
    sumac[0].id,
    'the second recipe uses the same one',
  );
  assert.equal(
    meal.items[3].refId,
    sumac[0].id,
    'and so does the ingredient item',
  );
  assert.ok(
    plan.ingredients.every((ingredient) => ingredient.name !== 'Quince'),
    'nothing is made for a recipe that is not written',
  );

  const mealKeys = Object.keys(meal);
  assert.ok(
    mealKeys.every((key) => getRuleKeys('isMeal', 'hasOnly').includes(key)),
  );
  assert.ok(
    getRuleKeys('isMeal', 'hasAll').every((key) => mealKeys.includes(key)),
  );
  assert.ok(meal.items.length >= 1 && meal.items.length <= MAX_MEAL_ITEMS);
  assert.ok(
    meal.items.every(
      (item) =>
        Object.keys(item).sort().join() === 'id,kind,refId,servings' &&
        item.id !== '' &&
        item.servings > 0,
    ),
    'items have the keys the rules allow',
  );

  assert.deepEqual(
    getCoverTargets(plan),
    [{ index: 0, recipeId: plan.recipes[0].recipe.id }],
    "the cover to copy names the recipe's place in the share, not in the plan",
  );

  const empty = planMealImport(
    {
      name: 'None',
      recipes: [],
      items: [{ kind: 'RECIPE', servings: 1, recipeIndex: 0 }],
    },
    [],
    NOW,
    makeCounter(),
  );
  assert.equal(empty.problem, EMPTY_MEAL_PROBLEM);
  assert.equal(empty.plan, null);

  const hollow = planMealImport(
    {
      name: 'Hollow',
      recipes: [recipeOf('Hollow', [])],
      items: [{ kind: 'RECIPE', servings: 1, recipeIndex: 0 }],
    },
    [],
    NOW,
    makeCounter(),
  );
  assert.equal(hollow.problem, NO_INGREDIENTS_PROBLEM);

  const only = getPlan(
    planMealImport(
      {
        name: 'Just bread',
        recipes: [],
        items: [
          {
            kind: 'INGREDIENT',
            servings: 1,
            name: 'Sourdough',
            catalogId: null,
          },
        ],
      },
      [],
      NOW,
      makeCounter(),
    ),
  );
  assert.equal(
    only.recipes.length,
    0,
    'a meal of only ingredients writes no recipe',
  );
  assert.equal(only.meal?.items.length, 1);
}

// ---- The batch stays under 500 writes at the largest shape the share allows ----
{
  const distinct = (tag: string, count: number) =>
    Array.from({ length: count }, (_, index) => line(`Spice ${tag}${index}`));
  const meal = (counts: number[]): SharedMeal => ({
    name: 'Big',
    recipes: counts.map((count, index) =>
      recipeOf(`Recipe ${index}`, distinct(`r${index}-`, count)),
    ),
    items: counts.map((_, index): SharedMealItem => ({
      kind: 'RECIPE',
      servings: 1,
      recipeIndex: index,
    })),
  });
  const writeCount = (plan: ShareImportPlan) =>
    plan.recipes.length +
    plan.recipes.reduce((sum, entry) => sum + entry.tips.length, 0) +
    plan.ingredients.length +
    (plan.meal ? 1 : 0);

  assert.equal(MAX_SHARED_MEAL_RECIPES, MAX_MEAL_ITEMS);
  assert.equal(
    MAX_IMPORT_WRITES,
    MAX_SHARED_MEAL_RECIPES + MAX_SHARED_MEAL_LINES + 1 + MAX_IMPORTED_TIPS,
  );
  assert.ok(MAX_IMPORT_WRITES < 500);

  const atCap = getPlan(
    planMealImport(
      meal(
        Array.from(
          { length: MAX_SHARED_MEAL_RECIPES },
          () => MAX_SHARED_MEAL_LINES / MAX_SHARED_MEAL_RECIPES,
        ),
      ),
      [],
      NOW,
      makeCounter(),
    ),
  );
  assert.equal(atCap.recipes.length, MAX_SHARED_MEAL_RECIPES);
  assert.equal(
    atCap.ingredients.length,
    MAX_SHARED_MEAL_LINES,
    'every line is a new ingredient in a kitchen with none',
  );
  assert.equal(
    writeCount(atCap),
    MAX_IMPORT_WRITES - MAX_IMPORTED_TIPS,
    'recipes + ingredients + the meal at the cap, before any tips',
  );
  assert.ok(writeCount(atCap) < 500, 'one batch holds it');

  const overCounts = [
    ...Array.from(
      { length: MAX_SHARED_MEAL_RECIPES - 1 },
      () => MAX_SHARED_MEAL_LINES / MAX_SHARED_MEAL_RECIPES,
    ),
    MAX_SHARED_MEAL_LINES / MAX_SHARED_MEAL_RECIPES + 1,
  ];
  const over = planMealImport(meal(overCounts), [], NOW, makeCounter());
  assert.equal(
    over.plan,
    null,
    'one line over the cap is refused, not written',
  );
  assert.equal(over.problem, TOO_BIG_PROBLEM);

  const huge = planMealImport(
    meal(
      Array.from(
        { length: MAX_SHARED_MEAL_RECIPES },
        () => MAX_RECIPE_INGREDIENTS,
      ),
    ),
    [],
    NOW,
    makeCounter(),
  );
  assert.equal(
    huge.plan,
    null,
    '10 recipes of 60 new lines would be over 500 writes, so none is made',
  );
  assert.equal(huge.problem, TOO_BIG_PROBLEM);
}

// ---- The Undo: the add's set, spares what is used or changed, and is all or none ----
{
  const soup = recipeOf('Soup', [line('Sumac'), line('Zaatar'), line('Leek')], {
    hasCover: true,
  });
  const salad = recipeOf('Salad', [line('Sumac'), line('Quince')]);
  const plan = getPlan(
    planMealImport(
      {
        name: 'Plate',
        recipes: [soup, salad],
        items: [
          { kind: 'RECIPE', servings: 2, recipeIndex: 0 },
          { kind: 'RECIPE', servings: 2, recipeIndex: 1 },
          {
            kind: 'INGREDIENT',
            servings: 1,
            name: 'Fennel pollen',
            catalogId: null,
          },
        ],
      },
      [],
      NOW,
      makeCounter(),
    ),
  );
  const coverId = plan.recipes[0].recipe.id;
  const written = getWritten(plan, [{ recipeId: coverId, updatedAt: NOW + 5 }]);
  assert.equal(written.missingCovers, 0);
  assert.deepEqual(written.coverRecipeIds, [coverId]);
  assert.equal(
    written.recipes[0].updatedAt,
    NOW + 5,
    'a recipe that got its cover carries the update that left',
  );
  assert.equal(
    getWritten(plan, []).missingCovers,
    1,
    'a cover that did not come along is counted',
  );

  const survey = (overrides: Partial<UndoSurvey> = {}): UndoSurvey => ({
    recipes: new Map(
      written.recipes.map((entry) => [
        entry.id,
        {
          updatedAt: entry.updatedAt,
          ingredientIds:
            plan.recipes
              .find((item) => item.recipe.id === entry.id)
              ?.recipe.ingredients.map((entry2) => entry2.ingredientId) ?? [],
        },
      ]),
    ),
    meals: new Map([
      [
        plan.meal!.id,
        { updatedAt: plan.meal!.updatedAt, items: plan.meal!.items },
      ],
    ]),
    ingredients: new Map(
      written.ingredients.map((entry) => [entry.id, entry.updatedAt]),
    ),
    usedIds: new Set<string>(),
    ...overrides,
  });

  const clean = planUndo(written, survey());
  assert.equal(clean.problem, null);
  if (clean.problem !== null) throw new Error('unreachable');
  assert.deepEqual(
    [...clean.recipeIds].sort(),
    [...ids(plan).recipes].sort(),
    'the Undo deletes exactly the recipes the add wrote',
  );
  assert.equal(clean.mealId, plan.meal!.id, 'and its meal');
  assert.deepEqual(
    [...clean.ingredientIds].sort(),
    [...ids(plan).ingredients].sort(),
    'and exactly the ingredients it made',
  );
  assert.equal(clean.keptIngredients, 0);

  const otherRecipe = {
    updatedAt: 5,
    ingredientIds: [
      plan.ingredients.find((ingredient) => ingredient.name === 'Zaatar')!.id,
    ],
  };
  const sparing = planUndo(
    written,
    survey({
      recipes: new Map([...survey().recipes, ['someone-elses', otherRecipe]]),
    }),
  );
  assert.equal(sparing.problem, null);
  if (sparing.problem !== null) throw new Error('unreachable');
  assert.ok(
    !sparing.ingredientIds.includes(otherRecipe.ingredientIds[0]),
    'an ingredient another recipe uses stays',
  );
  assert.equal(sparing.keptIngredients, 1);
  assert.equal(
    sparing.ingredientIds.length,
    plan.ingredients.length - 1,
    'and the rest still go',
  );

  const keptByMeal = planUndo(
    written,
    survey({
      meals: new Map([
        ...survey().meals,
        [
          'other-meal',
          {
            updatedAt: 3,
            items: [
              {
                id: 'm',
                kind: 'INGREDIENT' as const,
                refId: plan.ingredients[0].id,
                servings: 1,
              },
            ],
          },
        ],
      ]),
    }),
  );
  assert.equal(keptByMeal.problem, null);
  if (keptByMeal.problem !== null) throw new Error('unreachable');
  assert.ok(
    !keptByMeal.ingredientIds.includes(plan.ingredients[0].id),
    'one a saved meal uses stays',
  );

  const keptByPlan = planUndo(
    written,
    survey({ usedIds: new Set([plan.ingredients[1].id]) }),
  );
  if (keptByPlan.problem !== null) throw new Error('unreachable');
  assert.ok(
    !keptByPlan.ingredientIds.includes(plan.ingredients[1].id),
    'one a planned day or a price uses stays',
  );

  const adjusted = planUndo(
    written,
    survey({
      ingredients: new Map(
        written.ingredients.map((entry, index) => [
          entry.id,
          index === 0 ? entry.updatedAt + 1 : entry.updatedAt,
        ]),
      ),
    }),
  );
  if (adjusted.problem !== null) throw new Error('unreachable');
  assert.ok(
    !adjusted.ingredientIds.includes(written.ingredients[0].id),
    'one the person changed stays',
  );
  assert.equal(adjusted.keptIngredients, 1);

  const edited = planUndo(
    written,
    survey({
      recipes: new Map(
        [...survey().recipes].map(([id, value]) => [
          id,
          { ...value, updatedAt: value.updatedAt + 1 },
        ]),
      ),
    }),
  );
  assert.deepEqual(
    edited,
    { problem: UNDO_BLOCKED_PROBLEM },
    'an edited recipe means nothing is deleted',
  );

  const planned = planUndo(
    written,
    survey({ usedIds: new Set([written.recipes[1].id]) }),
  );
  assert.deepEqual(
    planned,
    { problem: UNDO_BLOCKED_PROBLEM },
    'a recipe on a planned day, or in a box, means nothing is deleted',
  );

  const inOtherMeal = planUndo(
    written,
    survey({
      meals: new Map([
        ...survey().meals,
        [
          'other-meal',
          {
            updatedAt: 3,
            items: [
              {
                id: 'm',
                kind: 'RECIPE' as const,
                refId: written.recipes[0].id,
                servings: 1,
              },
            ],
          },
        ],
      ]),
    }),
  );
  assert.deepEqual(
    inOtherMeal,
    { problem: UNDO_BLOCKED_PROBLEM },
    'a recipe in another saved meal means nothing is deleted',
  );

  const mealEdited = planUndo(
    written,
    survey({
      meals: new Map([
        [
          plan.meal!.id,
          { updatedAt: plan.meal!.updatedAt + 1, items: plan.meal!.items },
        ],
      ]),
    }),
  );
  assert.deepEqual(
    mealEdited,
    { problem: UNDO_BLOCKED_PROBLEM },
    'an edited meal means nothing is deleted',
  );

  const gone = planUndo(
    written,
    survey({
      recipes: new Map([...survey().recipes].slice(1)),
      meals: new Map(),
    }),
  );
  if (gone.problem !== null) throw new Error('unreachable');
  assert.deepEqual(
    gone.recipeIds,
    [written.recipes[1].id],
    'a recipe the person already deleted is skipped, not an error',
  );
  assert.equal(gone.mealId, null);
}

// ---- What the slot says ----
{
  assert.equal(getAddedMessage('RECIPE', 0), 'Added to your recipes');
  assert.equal(
    getAddedMessage('MEAL', 3),
    'Added the saved meal and its 3 recipes',
  );
  assert.equal(
    getAddedMessage('MEAL', 1),
    'Added the saved meal and its 1 recipe',
  );
  assert.equal(getAddedMessage('MEAL', 0), 'Added the saved meal');
  assert.equal(getUndoneMessage(0), 'Taken back.');
  assert.equal(
    getUndoneMessage(1),
    "Taken back. One ingredient you've used since stayed.",
  );
  assert.equal(
    getUndoneMessage(3),
    "Taken back. 3 ingredients you've used since stayed.",
  );
}

console.log(`pinchShareImport: ${state.passed} checks passed`);
