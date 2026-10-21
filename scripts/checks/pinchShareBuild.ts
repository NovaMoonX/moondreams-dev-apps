import assert from 'node:assert/strict';

import {
  MAX_SHARED_MEAL_LINES,
  MAX_SHARED_MEAL_RECIPES,
} from '../../src/apps/pinch/constants.ts';
import type {
  Meal,
  MealItem,
  PinchShare,
  Recipe,
  RecipeIngredient,
  ResolvedIngredient,
} from '../../src/apps/pinch/types.ts';
import {
  buildSharePayload,
  buildSharedMeal,
  buildSharedRecipe,
  getCoverRefs,
  getMealShareRecipes,
  getShareKey,
  getShareSourceStamp,
  getShareStatus,
  getShareUrl,
  isShareStale,
  type ShareSource,
} from '../../src/apps/pinch/utils/sharing.ts';

let passed = 0;
const check = (name: string, run: () => void) => {
  try {
    run();
    passed += 1;
  } catch (error) {
    console.error(`FAILED: ${name}`);
    throw error;
  }
};

const ingredient = (id: string, name: string, isCustom: boolean) =>
  ({
    id,
    name,
    familyId: null,
    aliases: ['secret alias'],
    per100g: { calories: 999, protein: null, carbs: null, fat: null },
    serving: { amount: 1, unit: 'G' },
    gramsPerMl: null,
    gramsEach: null,
    isCustom,
    isAdjusted: false,
    isArchived: false,
  }) satisfies ResolvedIngredient;

const ingredientsById = new Map<string, ResolvedIngredient>(
  [
    ingredient('cat-beef', 'Ground beef', false),
    ingredient('cat-onion', 'Onion', false),
    ingredient('custom-chili', 'Grandma chili mix', true),
  ].map((entry) => [entry.id, entry]),
);

const line = (
  id: string,
  ingredientId: string,
  amount: number | null,
  note: string | null,
  group: string | null,
) =>
  ({
    id,
    ingredientId,
    amount,
    unit: amount === null ? 'EACH' : 'G',
    note,
    group,
    priceCents: 777,
    productId: 'prod-secret',
  }) as RecipeIngredient;

const makeRecipe = (id: string, overrides: Partial<Recipe> = {}): Recipe => ({
  id,
  title: `Recipe ${id}`,
  description: 'Hearty and quick.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: null,
  coverPath: null,
  coverUrl: null,
  ingredients: [line(`${id}-1`, 'cat-beef', 500, 'lean', 'For the chili')],
  steps: ['Brown the beef.', 'Simmer.'],
  nutritionOverride: { calories: 987, protein: 1, carbs: 2, fat: 3 },
  source: 'AI_LINK',
  sourceId: 'src-secret',
  care: { fridgeDays: 3, freezerDays: null, reheat: 'Low heat', tip: null },
  collectionIds: ['col-secret'],
  links: [],
  isArchived: false,
  isFavorite: true,
  createdAt: 1,
  updatedAt: 100,
  ...overrides,
});

const PRIVATE_MARKERS = [
  'src-secret',
  'col-secret',
  'prod-secret',
  'priceCents',
  '777',
  '987',
  '999',
  'secret alias',
  'isFavorite',
  'collectionIds',
  'nutritionOverride',
  'createdAt',
  'updatedAt',
  'apps/pinch',
];

// ---- A recipe's copy: only the named fields ----
const full = makeRecipe('r-owner-1', {
  title: 'Weeknight chili',
  coverPath: 'apps/pinch/kitchens/owner-uid/recipes/r-owner-1/cover.webp',
  ingredients: [
    line('a', 'cat-beef', 500, 'lean', 'For the chili'),
    line('b', 'custom-chili', null, 'to taste', null),
    line('c', 'deleted-ingredient', 2, null, null),
    line('d', 'cat-onion', 1.5, null, 'For the chili'),
  ],
  links: [
    {
      id: 'l1',
      kind: 'HOW_TO',
      label: null,
      url: 'https://video.example.com/watch?v=abc',
    },
    {
      id: 'l2',
      kind: 'ARTICLE',
      label: 'The story',
      url: 'https://blog.example.com/chili',
    },
    {
      id: 'l3',
      kind: 'OTHER',
      label: 'Old page',
      url: 'http://old.example.com/chili',
    },
    { id: 'l4', kind: 'OTHER', label: 'Odd', url: 'javascript:alert(1)' },
  ],
});
const shared = buildSharedRecipe(full, ingredientsById);

check('a recipe copy has exactly the public keys', () => {
  assert.deepEqual(Object.keys(shared).sort(), [
    'care',
    'cookMinutes',
    'description',
    'hasCover',
    'ingredients',
    'links',
    'prepMinutes',
    'servings',
    'steps',
    'title',
  ]);
});

check('a recipe copy carries none of the private fields', () => {
  const text = JSON.stringify(shared);
  PRIVATE_MARKERS.forEach((marker) =>
    assert.ok(!text.includes(marker), `"${marker}" leaked into the copy`),
  );
  assert.ok(!text.includes('r-owner-1'), "the owner's recipe id leaked");
  assert.ok(!text.includes('owner-uid'), "the owner's uid leaked");
});

check('a field added to the recipe later stays out of the copy', () => {
  const grown = { ...full, brandNewField: 'LEAK-ME' } as Recipe;
  assert.ok(
    !JSON.stringify(buildSharedRecipe(grown, ingredientsById)).includes('LEAK'),
  );
});

check('the public fields are kept as they are', () => {
  assert.equal(shared.title, 'Weeknight chili');
  assert.equal(shared.description, 'Hearty and quick.');
  assert.equal(shared.servings, 4);
  assert.equal(shared.prepMinutes, 10);
  assert.equal(shared.cookMinutes, null);
  assert.deepEqual(shared.steps, ['Brown the beef.', 'Simmer.']);
  assert.deepEqual(shared.care, {
    fridgeDays: 3,
    freezerDays: null,
    reheat: 'Low heat',
    tip: null,
  });
});

check('the copy of the steps is its own array', () => {
  assert.notEqual(shared.steps, full.steps);
});

check('an ingredient line has exactly the public keys', () => {
  shared.ingredients.forEach((entry) =>
    assert.deepEqual(Object.keys(entry).sort(), [
      'amount',
      'catalogId',
      'group',
      'name',
      'note',
      'unit',
    ]),
  );
});

check(
  'a line whose ingredient is gone is dropped and the order is kept',
  () => {
    assert.deepEqual(
      shared.ingredients.map((entry) => entry.name),
      ['Ground beef', 'Grandma chili mix', 'Onion'],
    );
  },
);

check('a catalog line names its catalog id and a custom one has none', () => {
  assert.equal(shared.ingredients[0].catalogId, 'cat-beef');
  assert.equal(shared.ingredients[1].catalogId, null);
  assert.equal(shared.ingredients[2].catalogId, 'cat-onion');
});

check('an amountless line stays amountless with its note', () => {
  assert.equal(shared.ingredients[1].amount, null);
  assert.equal(shared.ingredients[1].unit, 'EACH');
  assert.equal(shared.ingredients[1].note, 'to taste');
});

check('amounts, units, notes and groups are kept', () => {
  assert.deepEqual(shared.ingredients[0], {
    name: 'Ground beef',
    catalogId: 'cat-beef',
    amount: 500,
    unit: 'G',
    note: 'lean',
    group: 'For the chili',
  });
  assert.equal(shared.ingredients[2].amount, 1.5);
});

check(
  'only https links are kept, with the kind, the label and the address',
  () => {
    assert.deepEqual(shared.links, [
      {
        kind: 'HOW_TO',
        label: null,
        url: 'https://video.example.com/watch?v=abc',
      },
      {
        kind: 'ARTICLE',
        label: 'The story',
        url: 'https://blog.example.com/chili',
      },
    ]);
  },
);

check('an uploaded cover is flagged and a web cover is not shared', () => {
  assert.equal(shared.hasCover, true);
  const web = buildSharedRecipe(
    makeRecipe('r-web', { coverUrl: 'https://photos.example.com/stew.jpg' }),
    ingredientsById,
  );
  assert.equal(web.hasCover, false);
  assert.ok(!JSON.stringify(web).includes('photos.example.com'));
});

check('a recipe written before care and links shares as none', () => {
  const legacy = makeRecipe('r-old') as Partial<Recipe>;
  delete legacy.care;
  delete legacy.links;
  const copy = buildSharedRecipe(legacy as Recipe, ingredientsById);
  assert.equal(copy.care, null);
  assert.deepEqual(copy.links, []);
});

check('care with nothing in it shares as none', () => {
  const copy = buildSharedRecipe(
    makeRecipe('r-empty-care', {
      care: { fridgeDays: null, freezerDays: null, reheat: null, tip: null },
    }),
    ingredientsById,
  );
  assert.equal(copy.care, null);
});

// ---- A saved meal's copy ----
const alpha = makeRecipe('alpha', {
  coverPath: 'apps/pinch/kitchens/u/recipes/alpha/cover.webp',
  updatedAt: 200,
});
const beta = makeRecipe('beta', { updatedAt: 150 });
const gamma = makeRecipe('gamma', {
  coverPath: 'apps/pinch/kitchens/u/recipes/gamma/cover.webp',
  updatedAt: 120,
});
const recipesById = new Map<string, Recipe>(
  [alpha, beta, gamma].map((entry) => [entry.id, entry]),
);

const item = (
  kind: MealItem['kind'],
  refId: string,
  servings: number,
): MealItem => ({ id: `${kind}-${refId}-${servings}`, kind, refId, servings });

const meal: Meal = {
  id: 'meal-owner-1',
  name: 'Sunday supper',
  items: [
    item('RECIPE', 'beta', 2),
    item('RECIPE', 'alpha', 4),
    item('INGREDIENT', 'cat-onion', 1),
    item('RECIPE', 'alpha', 2),
    item('RECIPE', 'vanished-recipe', 1),
    item('INGREDIENT', 'vanished-ingredient', 1),
    item('INGREDIENT', 'custom-chili', 3),
  ],
  isFavorite: true,
  createdAt: 5,
  updatedAt: 90,
};
const sharedMeal = buildSharedMeal(meal, recipesById, ingredientsById);

check('a meal that can be shared is not an error', () => {
  assert.ok(!('error' in sharedMeal));
});

if (!('error' in sharedMeal)) {
  check('a meal copy has exactly the public keys and no ids', () => {
    assert.deepEqual(Object.keys(sharedMeal).sort(), [
      'items',
      'name',
      'recipes',
    ]);
    const text = JSON.stringify(sharedMeal);
    ['meal-owner-1', 'isFavorite', 'refId', '"id"', 'recipeId'].forEach(
      (marker) =>
        assert.ok(
          !text.includes(marker),
          `"${marker}" leaked into the meal copy`,
        ),
    );
    PRIVATE_MARKERS.forEach((marker) =>
      assert.ok(
        !text.includes(marker),
        `"${marker}" leaked into the meal copy`,
      ),
    );
  });

  check('each recipe is inline once, in the order it first appears', () => {
    assert.deepEqual(
      sharedMeal.recipes.map((entry) => entry.title),
      ['Recipe beta', 'Recipe alpha'],
    );
    assert.deepEqual(
      getMealShareRecipes(meal, recipesById).map((entry) => entry.id),
      ['beta', 'alpha'],
    );
  });

  check('items point at their recipe by index and a repeat shares it', () => {
    assert.deepEqual(sharedMeal.items, [
      { kind: 'RECIPE', servings: 2, recipeIndex: 0 },
      { kind: 'RECIPE', servings: 4, recipeIndex: 1 },
      {
        kind: 'INGREDIENT',
        servings: 1,
        name: 'Onion',
        catalogId: 'cat-onion',
      },
      { kind: 'RECIPE', servings: 2, recipeIndex: 1 },
      {
        kind: 'INGREDIENT',
        servings: 3,
        name: 'Grandma chili mix',
        catalogId: null,
      },
    ]);
  });

  check('items whose recipe or ingredient is gone are dropped', () => {
    assert.equal(sharedMeal.items.length, 5);
  });
}

check('a meal with nothing left is refused with a reason', () => {
  const result = buildSharedMeal(
    { ...meal, items: [item('RECIPE', 'vanished-recipe', 1)] },
    recipesById,
    ingredientsById,
  );
  assert.ok('error' in result && result.error.length > 0);
});

check('a meal over the recipe cap is refused with a reason', () => {
  const many = Array.from({ length: MAX_SHARED_MEAL_RECIPES + 1 }, (_, index) =>
    makeRecipe(`many-${index}`),
  );
  const result = buildSharedMeal(
    {
      ...meal,
      items: many.map((entry) => item('RECIPE', entry.id, 1)),
    },
    new Map(many.map((entry) => [entry.id, entry])),
    ingredientsById,
  );
  assert.ok('error' in result);
});

check('a meal at the recipe cap is shared', () => {
  const exactly = Array.from({ length: MAX_SHARED_MEAL_RECIPES }, (_, index) =>
    makeRecipe(`exact-${index}`),
  );
  const result = buildSharedMeal(
    { ...meal, items: exactly.map((entry) => item('RECIPE', entry.id, 1)) },
    new Map(exactly.map((entry) => [entry.id, entry])),
    ingredientsById,
  );
  assert.ok(!('error' in result));
});

const withLines = (count: number) =>
  makeRecipe('long', {
    ingredients: Array.from({ length: count }, (_, index) =>
      line(`long-${index}`, 'cat-beef', 1, null, null),
    ),
  });
const mealOfLines = (count: number) => {
  const long = withLines(count);
  return buildSharedMeal(
    { ...meal, items: [item('RECIPE', 'long', 1)] },
    new Map([[long.id, long]]),
    ingredientsById,
  );
};

check('a meal over the ingredient line cap is refused with a reason', () => {
  assert.ok('error' in mealOfLines(MAX_SHARED_MEAL_LINES + 1));
});

check('a meal at the ingredient line cap is shared', () => {
  assert.ok(!('error' in mealOfLines(MAX_SHARED_MEAL_LINES)));
});

check('plain ingredient items count toward the line cap', () => {
  const long = withLines(MAX_SHARED_MEAL_LINES);
  const result = buildSharedMeal(
    {
      ...meal,
      items: [item('RECIPE', 'long', 1), item('INGREDIENT', 'cat-onion', 1)],
    },
    new Map([[long.id, long]]),
    ingredientsById,
  );
  assert.ok('error' in result);
});

// ---- Covers ----
check('covers name each uploaded cover with its index in the share', () => {
  assert.deepEqual(getCoverRefs([alpha, beta, gamma]), [
    { index: 0, recipeId: 'alpha' },
    { index: 2, recipeId: 'gamma' },
  ]);
  assert.deepEqual(getCoverRefs([beta]), []);
});

check('a recipe share asks for its own cover at index 0', () => {
  const payload = buildSharePayload(
    { kind: 'RECIPE', recipe: alpha },
    recipesById,
    ingredientsById,
  );
  assert.ok(!('error' in payload));
  if (!('error' in payload)) {
    assert.deepEqual(payload.covers, [{ index: 0, recipeId: 'alpha' }]);
    assert.equal(payload.meal, null);
    assert.equal(payload.recipe?.title, 'Recipe alpha');
  }
});

check('a meal share asks for the covers at the indexes of its recipes', () => {
  const payload = buildSharePayload(
    { kind: 'MEAL', meal },
    recipesById,
    ingredientsById,
  );
  assert.ok(!('error' in payload));
  if (!('error' in payload)) {
    assert.deepEqual(payload.covers, [{ index: 1, recipeId: 'alpha' }]);
    assert.equal(payload.recipe, null);
    assert.equal(payload.meal?.recipes.length, 2);
  }
});

check('a meal that cannot be shared has no payload, only its reason', () => {
  const payload = buildSharePayload(
    { kind: 'MEAL', meal: { ...meal, items: [] } },
    recipesById,
    ingredientsById,
  );
  assert.ok('error' in payload);
});

// ---- Changed since it was shared ----
const recipeSource: ShareSource = { kind: 'RECIPE', recipe: alpha };
const mealSource: ShareSource = { kind: 'MEAL', meal };
const share = (
  kind: PinchShare['kind'],
  sourceId: string,
  sourceUpdatedAt: number,
): PinchShare => ({
  id: 'abcdefghjkmnpqrstuvwxyz234',
  ownerUid: 'owner-uid',
  kind,
  sourceId,
  title: 'Anything',
  sourceUpdatedAt,
  createdAt: 1,
  updatedAt: 1,
});

check('a recipe is stamped by its own change time', () => {
  assert.equal(getShareSourceStamp(recipeSource, recipesById), 200);
});

check("a meal is stamped by the latest of its own and its recipes'", () => {
  assert.equal(getShareSourceStamp(mealSource, recipesById), 200);
  assert.equal(
    getShareSourceStamp(
      { kind: 'MEAL', meal: { ...meal, updatedAt: 500 } },
      recipesById,
    ),
    500,
  );
});

check(
  'a recipe changed after it was shared is stale, an unchanged one is not',
  () => {
    const taken = share(
      'RECIPE',
      'alpha',
      getShareSourceStamp(recipeSource, recipesById),
    );
    assert.equal(
      isShareStale(taken, getShareSourceStamp(recipeSource, recipesById)),
      false,
    );
    const edited = new Map(recipesById).set('alpha', {
      ...alpha,
      updatedAt: 201,
    });
    assert.equal(
      getShareStatus(taken, edited, new Map()).isStale,
      true,
      'edited after the copy',
    );
    assert.equal(getShareStatus(taken, recipesById, new Map()).isStale, false);
  },
);

check('a meal is stale when one of its recipes changed', () => {
  const taken = share(
    'MEAL',
    'meal-owner-1',
    getShareSourceStamp(mealSource, recipesById),
  );
  const mealsById = new Map([[meal.id, meal]]);
  assert.equal(getShareStatus(taken, recipesById, mealsById).isStale, false);
  const edited = new Map(recipesById).set('beta', { ...beta, updatedAt: 999 });
  assert.equal(getShareStatus(taken, edited, mealsById).isStale, true);
});

check('a meal is stale when its own items changed', () => {
  const taken = share(
    'MEAL',
    'meal-owner-1',
    getShareSourceStamp(mealSource, recipesById),
  );
  const edited = new Map([[meal.id, { ...meal, updatedAt: 1000 }]]);
  assert.equal(getShareStatus(taken, recipesById, edited).isStale, true);
});

check('a link whose original is deleted is gone, and never stale', () => {
  const orphan = share('RECIPE', 'long-gone', 0);
  assert.deepEqual(getShareStatus(orphan, recipesById, new Map()), {
    isGone: true,
    isStale: false,
  });
  const orphanMeal = share('MEAL', 'long-gone', 0);
  assert.equal(getShareStatus(orphanMeal, recipesById, new Map()).isGone, true);
});

check('an archived original still counts as there', () => {
  const archived = new Map(recipesById).set('alpha', {
    ...alpha,
    isArchived: true,
  });
  const taken = share('RECIPE', 'alpha', 200);
  assert.equal(getShareStatus(taken, archived, new Map()).isGone, false);
});

// ---- The address ----
check('a link is the origin, the share path and the id', () => {
  assert.equal(
    getShareUrl('abc234', 'https://pinch.example.com'),
    'https://pinch.example.com/pinch/shared/abc234',
  );
  assert.equal(getShareKey('RECIPE', 'x'), 'RECIPE:x');
  assert.notEqual(getShareKey('RECIPE', 'x'), getShareKey('MEAL', 'x'));
});

console.log(`pinchShareBuild: ${passed} checks passed`);
