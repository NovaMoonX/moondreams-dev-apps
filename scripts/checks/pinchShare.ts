import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SHARE_LIMITS,
  SHARE_LINK_KINDS,
  SHARE_UNITS,
  isShareOwner,
  isShareId,
  kitchenCoverPath,
  mintShareId,
  shareCoverPath,
  toCoverRefs,
  toCoveredCopy,
  toIncludedCopy,
  toShareIncludes,
  toShareResult,
  toSharedMeal,
  toSharedRecipe,
} from '../../functions/src/apps/pinch/pinchShareView.ts';
import * as clientConstants from '../../src/apps/pinch/constants.ts';
import { SEED_SHARE_IDS, buildSeedShares } from '../seeds/pinch.ts';

const L = SHARE_LIMITS;
const firestoreRules = readFileSync('firestore.rules', 'utf8');
const storageRules = readFileSync('storage.rules', 'utf8');

let passed = 0;
function check(title: string, run: () => void) {
  try {
    run();
  } catch (error) {
    console.error(`FAILED: ${title}`);
    throw error;
  }
  passed += 1;
}

const ingredient = (extra: Record<string, unknown> = {}) => ({
  name: 'Chicken thigh',
  catalogId: 'cat-chicken-thigh',
  amount: 2,
  unit: 'LB',
  note: null,
  group: null,
  ...extra,
});

const recipe = (extra: Record<string, unknown> = {}) => ({
  title: 'Adobo chicken',
  description: 'Sticky and tangy.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 35,
  ingredients: [ingredient()],
  steps: ['Simmer.'],
  care: null,
  links: [],
  tips: [],
  notes: [],
  hasCover: false,
  ...extra,
});

const recipeOf = (extra: Record<string, unknown> = {}) => {
  const result = toSharedRecipe(recipe(extra));
  assert.ok(result, 'the recipe is readable');
  return result;
};

const many = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index));

const text = (length: number) => 'x'.repeat(length);

check(
  'the allowlist rebuilds a recipe with exactly the named keys and drops everything else',
  () => {
    const hostile = JSON.parse(
      JSON.stringify({
        ...recipe(),
        ownerUid: 'owner-uid-secret',
        priceCents: 499,
        changes: ['a planned change'],
        history: ['a private cook'],
        nutritionOverride: { calories: 1 },
        coverUrl: 'https://tracker.example/pixel.png',
        coverPath: 'apps/pinch/kitchens/owner-uid-secret/recipes/r/cover.webp',
        isFavorite: true,
        id: 'recipe-id-secret',
        collectionIds: ['c1'],
        sourceId: 'source-id-secret',
        ingredients: [
          ingredient({
            ingredientId: 'ing-secret',
            priceCents: 12,
            productId: 'p',
          }),
        ],
        links: [
          {
            kind: 'ARTICLE',
            label: 'Read',
            url: 'https://example.com/a',
            id: 'link-id-secret',
          },
        ],
        care: {
          fridgeDays: 3,
          freezerDays: null,
          reheat: null,
          tip: null,
          extra: 'nested-secret',
        },
      }),
    );
    const result = toSharedRecipe(hostile);
    assert.ok(result);
    assert.deepEqual(Object.keys(result).sort(), [
      'care',
      'cookMinutes',
      'description',
      'hasCover',
      'ingredients',
      'links',
      'notes',
      'prepMinutes',
      'servings',
      'steps',
      'tips',
      'title',
    ]);
    assert.deepEqual(Object.keys(result.ingredients[0]).sort(), [
      'amount',
      'catalogId',
      'group',
      'name',
      'note',
      'unit',
    ]);
    assert.deepEqual(Object.keys(result.links[0]).sort(), [
      'kind',
      'label',
      'url',
    ]);
    assert.deepEqual(Object.keys(result.care ?? {}).sort(), [
      'freezerDays',
      'fridgeDays',
      'reheat',
      'tip',
    ]);
    const body = JSON.stringify(result);
    [
      'owner-uid-secret',
      'priceCents',
      'a private note',
      'nutritionOverride',
      'tracker.example',
      'recipe-id-secret',
      'source-id-secret',
      'ing-secret',
      'link-id-secret',
      'nested-secret',
      'isFavorite',
    ].forEach((forbidden) => assert.ok(!body.includes(forbidden), forbidden));
  },
);

check(
  'a __proto__ key on the input neither pollutes nor reaches the copy',
  () => {
    const raw = JSON.parse(
      '{"title":"T","servings":2,"steps":["s"],"ingredients":[{"name":"n","unit":"G","amount":1,"__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}',
    );
    const result = toSharedRecipe(raw);
    assert.ok(result);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.ok(!JSON.stringify(result).includes('polluted'));
    assert.ok(!('polluted' in result));
  },
);

check(
  'only https links survive, with no sign-in in the address, and a link is never cut short',
  () => {
    const links = [
      'https://example.com/ok',
      'http://example.com/plain',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'ftp://example.com/x',
      '//example.com/x',
      'https://user:pw@example.com/x',
      'https://user@example.com/x',
      'not a url',
      `https://example.com/${text(L.MAX_LINK_URL_LENGTH)}`,
    ].map((url) => ({ kind: 'OTHER', label: null, url }));
    const result = recipeOf({ links });
    assert.deepEqual(
      result.links.map((link) => link.url),
      ['https://example.com/ok'],
    );
    const prefix = 'https://example.com/';
    const atCap = recipeOf({
      links: [
        {
          kind: 'OTHER',
          label: null,
          url: prefix + text(L.MAX_LINK_URL_LENGTH - prefix.length),
        },
      ],
    });
    assert.equal(atCap.links[0].url.length, L.MAX_LINK_URL_LENGTH);
    const overCap = recipeOf({
      links: [
        {
          kind: 'OTHER',
          label: null,
          url: prefix + text(L.MAX_LINK_URL_LENGTH - prefix.length + 1),
        },
      ],
    });
    assert.deepEqual(
      overCap.links,
      [],
      'one character over drops the link whole',
    );
  },
);

check(
  'a link kind outside the list becomes OTHER and only the first how-to video stays one',
  () => {
    const result = recipeOf({
      links: [
        { kind: 'HOW_TO', label: null, url: 'https://example.com/1' },
        { kind: 'HOW_TO', label: null, url: 'https://example.com/2' },
        { kind: 'SPONSORED', label: null, url: 'https://example.com/3' },
      ],
    });
    assert.deepEqual(
      result.links.map((link) => link.kind),
      ['HOW_TO', 'OTHER', 'OTHER'],
    );
  },
);

check(
  'an unknown unit keeps the line by its name alone, with no invented amount',
  () => {
    const result = recipeOf({
      ingredients: [
        ingredient({ unit: 'PARSEC', amount: 3 }),
        ingredient({
          name: 'Salt',
          unit: 'EACH',
          amount: null,
          note: 'to taste',
        }),
        ingredient({ name: 'Pepper', unit: undefined, amount: 1 }),
      ],
    });
    assert.deepEqual(
      result.ingredients.map((line) => [line.name, line.unit, line.amount]),
      [
        ['Chicken thigh', 'EACH', null],
        ['Salt', 'EACH', null],
        ['Pepper', 'EACH', null],
      ],
    );
  },
);

check(
  'an amount outside zero to the cap, or not a number, becomes no amount',
  () => {
    const amounts = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      L.MAX_SERVING_AMOUNT + 1,
      '2',
      null,
      undefined,
    ];
    const result = recipeOf({
      ingredients: amounts.map((amount) => ingredient({ amount })),
    });
    assert.ok(result.ingredients.every((line) => line.amount === null));
    const valid = recipeOf({
      ingredients: [
        ingredient({ amount: L.MAX_SERVING_AMOUNT }),
        ingredient({ amount: 0.001 }),
      ],
    });
    assert.deepEqual(
      valid.ingredients.map((line) => line.amount),
      [L.MAX_SERVING_AMOUNT, 0.001],
    );
  },
);

check('a catalog id is kept only when it has the cat- shape', () => {
  const ids = [
    'cat-chicken-thigh',
    `cat-${text(80).replaceAll('x', 'a')}`,
    `cat-${text(81).replaceAll('x', 'a')}`,
    'cat-',
    '../x',
    'cat-../x',
    'CAT-UPPER',
    'cat-has space',
    'seed-pinch-ingredient-x',
    7,
  ];
  const result = recipeOf({
    ingredients: ids.map((catalogId) => ingredient({ catalogId })),
  });
  assert.deepEqual(
    result.ingredients.map((line) => line.catalogId),
    [
      'cat-chicken-thigh',
      ids[1],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  );
});

check('every text and list cap holds at the cap and one past it', () => {
  const title = (length: number) =>
    toSharedRecipe(recipe({ title: text(length) }))?.title.length;
  assert.equal(title(L.MAX_RECIPE_TITLE_LENGTH), L.MAX_RECIPE_TITLE_LENGTH);
  assert.equal(title(L.MAX_RECIPE_TITLE_LENGTH + 1), L.MAX_RECIPE_TITLE_LENGTH);
  assert.equal(title(50_000), L.MAX_RECIPE_TITLE_LENGTH);

  const description = (length: number) =>
    toSharedRecipe(recipe({ description: text(length) }))?.description?.length;
  assert.equal(
    description(L.MAX_RECIPE_DESCRIPTION_LENGTH),
    L.MAX_RECIPE_DESCRIPTION_LENGTH,
  );
  assert.equal(
    description(L.MAX_RECIPE_DESCRIPTION_LENGTH + 1),
    L.MAX_RECIPE_DESCRIPTION_LENGTH,
  );

  const steps = (count: number, length = 5) =>
    toSharedRecipe(recipe({ steps: many(count, () => text(length)) }))?.steps;
  assert.equal(steps(L.MAX_RECIPE_STEPS)?.length, L.MAX_RECIPE_STEPS);
  assert.equal(steps(L.MAX_RECIPE_STEPS + 1)?.length, L.MAX_RECIPE_STEPS);
  assert.equal(steps(500)?.length, L.MAX_RECIPE_STEPS);
  assert.equal(steps(1, L.MAX_STEP_LENGTH)?.[0].length, L.MAX_STEP_LENGTH);
  assert.equal(steps(1, L.MAX_STEP_LENGTH + 1)?.[0].length, L.MAX_STEP_LENGTH);

  const lines = (count: number) =>
    toSharedRecipe(recipe({ ingredients: many(count, () => ingredient()) }))
      ?.ingredients.length;
  assert.equal(lines(L.MAX_RECIPE_INGREDIENTS), L.MAX_RECIPE_INGREDIENTS);
  assert.equal(lines(L.MAX_RECIPE_INGREDIENTS + 1), L.MAX_RECIPE_INGREDIENTS);

  const links = (count: number) =>
    toSharedRecipe(
      recipe({
        links: many(count, (index) => ({
          kind: 'OTHER',
          label: null,
          url: `https://example.com/${index}`,
        })),
      }),
    )?.links.length;
  assert.equal(links(L.MAX_RECIPE_LINKS), L.MAX_RECIPE_LINKS);
  assert.equal(links(L.MAX_RECIPE_LINKS + 1), L.MAX_RECIPE_LINKS);

  const line = (extra: Record<string, unknown>) =>
    toSharedRecipe(recipe({ ingredients: [ingredient(extra)] }))
      ?.ingredients[0];
  assert.equal(
    line({ name: text(L.MAX_NAME_LENGTH) })?.name.length,
    L.MAX_NAME_LENGTH,
  );
  assert.equal(
    line({ name: text(L.MAX_NAME_LENGTH + 1) })?.name.length,
    L.MAX_NAME_LENGTH,
  );
  assert.equal(
    line({ note: text(L.MAX_NOTE_LENGTH + 1) })?.note?.length,
    L.MAX_NOTE_LENGTH,
  );
  assert.equal(
    line({ note: text(L.MAX_NOTE_LENGTH) })?.note?.length,
    L.MAX_NOTE_LENGTH,
  );
  assert.equal(
    line({ group: text(L.MAX_INGREDIENT_GROUP_LENGTH + 1) })?.group?.length,
    L.MAX_INGREDIENT_GROUP_LENGTH,
  );
  assert.equal(
    line({ group: text(L.MAX_INGREDIENT_GROUP_LENGTH) })?.group?.length,
    L.MAX_INGREDIENT_GROUP_LENGTH,
  );

  const label = (length: number) =>
    toSharedRecipe(
      recipe({
        links: [
          { kind: 'OTHER', label: text(length), url: 'https://example.com/a' },
        ],
      }),
    )?.links[0].label?.length;
  assert.equal(label(L.MAX_LINK_LABEL_LENGTH), L.MAX_LINK_LABEL_LENGTH);
  assert.equal(label(L.MAX_LINK_LABEL_LENGTH + 1), L.MAX_LINK_LABEL_LENGTH);

  const care = (key: 'reheat' | 'tip', length: number) =>
    toSharedRecipe(
      recipe({
        care: {
          fridgeDays: null,
          freezerDays: null,
          reheat: null,
          tip: null,
          [key]: text(length),
        },
      }),
    )?.care?.[key]?.length;
  assert.equal(
    care('reheat', L.MAX_CARE_REHEAT_LENGTH),
    L.MAX_CARE_REHEAT_LENGTH,
  );
  assert.equal(
    care('reheat', L.MAX_CARE_REHEAT_LENGTH + 1),
    L.MAX_CARE_REHEAT_LENGTH,
  );
  assert.equal(care('tip', L.MAX_CARE_TIP_LENGTH), L.MAX_CARE_TIP_LENGTH);
  assert.equal(care('tip', L.MAX_CARE_TIP_LENGTH + 1), L.MAX_CARE_TIP_LENGTH);
});

check(
  'text is trimmed, a cut never leaves half a character, and blank text is nothing',
  () => {
    const emoji = '🍗';
    const cut = toSharedRecipe(
      recipe({ title: text(L.MAX_RECIPE_TITLE_LENGTH - 1) + emoji }),
    );
    assert.equal(cut?.title, text(L.MAX_RECIPE_TITLE_LENGTH - 1));
    assert.equal(
      toSharedRecipe(recipe({ title: '  Adobo  ' }))?.title,
      'Adobo',
    );
    assert.equal(toSharedRecipe(recipe({ title: '   ' })), null);
    assert.equal(
      toSharedRecipe(recipe({ description: '   ' }))?.description,
      null,
    );
    assert.deepEqual(
      toSharedRecipe(recipe({ steps: ['  ', 'Mix.', ''] }))?.steps,
      ['Mix.'],
    );
  },
);

check('minutes and care days outside what the rules take become none', () => {
  const minutes = (value: unknown) =>
    toSharedRecipe(recipe({ prepMinutes: value }))?.prepMinutes;
  assert.equal(minutes(0), 0);
  assert.equal(minutes(L.MAX_MINUTES), L.MAX_MINUTES);
  assert.equal(minutes(L.MAX_MINUTES + 1), null);
  assert.equal(minutes(-1), null);
  assert.equal(minutes(1.5), null);
  assert.equal(minutes(Number.NaN), null);
  const days = (value: unknown) =>
    toSharedRecipe(
      recipe({
        care: {
          fridgeDays: value,
          freezerDays: null,
          reheat: 'Warm it.',
          tip: null,
        },
      }),
    )?.care?.fridgeDays;
  assert.equal(days(1), 1);
  assert.equal(days(L.MAX_CARE_DAYS), L.MAX_CARE_DAYS);
  assert.equal(days(L.MAX_CARE_DAYS + 1), null);
  assert.equal(
    days(0),
    null,
    "the owner's own rules refuse 0 days, so a copy of it would be refused too",
  );
  assert.equal(
    toSharedRecipe(
      recipe({
        care: { fridgeDays: 0, freezerDays: null, reheat: null, tip: null },
      }),
    )?.care,
    null,
  );
});

check(
  'a recipe with no usable title, servings, or both ingredients and steps is refused whole',
  () => {
    assert.equal(toSharedRecipe(null), null);
    assert.equal(toSharedRecipe('recipe'), null);
    assert.equal(toSharedRecipe([]), null);
    assert.equal(toSharedRecipe(recipe({ title: undefined })), null);
    assert.equal(toSharedRecipe(recipe({ title: 7 })), null);
    assert.equal(toSharedRecipe(recipe({ servings: 0 })), null);
    assert.equal(toSharedRecipe(recipe({ servings: Number.NaN })), null);
    assert.equal(
      toSharedRecipe(recipe({ servings: L.MAX_SERVING_AMOUNT + 1 })),
      null,
    );
    assert.equal(toSharedRecipe(recipe({ ingredients: [], steps: [] })), null);
    assert.equal(
      toSharedRecipe(recipe({ ingredients: [{ name: ' ' }], steps: [' '] })),
      null,
    );
    assert.ok(
      toSharedRecipe(recipe({ ingredients: [], steps: ['Just stir.'] })),
    );
    assert.ok(
      toSharedRecipe(recipe({ ingredients: [ingredient()], steps: [] })),
    );
    assert.equal(
      toSharedRecipe(recipe({ servings: L.MAX_SERVING_AMOUNT }))?.servings,
      L.MAX_SERVING_AMOUNT,
    );
  },
);

check(
  'a client can never claim a cover: hasCover is false on input and only the copied indexes turn it on',
  () => {
    assert.equal(toSharedRecipe(recipe({ hasCover: true }))?.hasCover, false);
    assert.equal(
      toSharedRecipe(recipe({ hasCover: true }), true)?.hasCover,
      true,
      'a stored copy keeps what the server recorded',
    );
    assert.equal(
      toSharedRecipe(recipe({ hasCover: 'yes' }), true)?.hasCover,
      false,
    );
    const meal = toSharedMeal({
      name: 'Dinner',
      recipes: [recipe({ hasCover: true }), recipe({ hasCover: true })],
      items: [
        { kind: 'RECIPE', servings: 1, recipeIndex: 0 },
        { kind: 'RECIPE', servings: 1, recipeIndex: 1 },
      ],
    });
    assert.ok(meal);
    assert.deepEqual(
      meal.recipes.map((entry) => entry.hasCover),
      [false, false],
    );
    const covered = toCoveredCopy({ recipe: null, meal }, new Set([1]));
    assert.deepEqual(
      covered.meal?.recipes.map((entry) => entry.hasCover),
      [false, true],
    );
    const single = toCoveredCopy(
      { recipe: recipeOf(), meal: null },
      new Set([0]),
    );
    assert.equal(single.recipe?.hasCover, true);
    assert.equal(
      toCoveredCopy({ recipe: recipeOf(), meal: null }, new Set()).recipe
        ?.hasCover,
      false,
    );
  },
);

const mealOf = (
  recipes: unknown[],
  items: unknown[],
  name: unknown = 'Dinner',
) => toSharedMeal({ name, recipes, items });
const recipeItem = (recipeIndex: unknown, servings: unknown = 2) => ({
  kind: 'RECIPE',
  servings,
  recipeIndex,
});

check('a meal keeps its recipes once, in order, and its items by index', () => {
  const result = mealOf(
    [recipe({ title: 'Adobo' }), recipe({ title: 'Rice' })],
    [
      recipeItem(0),
      recipeItem(1, 3),
      {
        kind: 'INGREDIENT',
        servings: 1,
        name: 'Banana',
        catalogId: 'cat-banana',
        priceCents: 5,
      },
    ],
  );
  assert.ok(result);
  assert.deepEqual(
    result.recipes.map((entry) => entry.title),
    ['Adobo', 'Rice'],
  );
  assert.deepEqual(result.items, [
    { kind: 'RECIPE', servings: 2, recipeIndex: 0 },
    { kind: 'RECIPE', servings: 3, recipeIndex: 1 },
    {
      kind: 'INGREDIENT',
      servings: 1,
      name: 'Banana',
      catalogId: 'cat-banana',
    },
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['items', 'name', 'recipes']);
  assert.ok(
    mealOf(
      [],
      [{ kind: 'INGREDIENT', servings: 1, name: 'Banana', catalogId: null }],
    ),
    'a meal of ingredients alone is fine',
  );
});

check(
  'a meal with a recipe index out of range, or not a whole number, is refused whole',
  () => {
    const recipes = many(3, () => recipe());
    [-1, 3, 10, 1.5, '0', null, undefined, Number.NaN].forEach((index) =>
      assert.equal(
        mealOf(recipes, [recipeItem(0), recipeItem(index)]),
        null,
        String(index),
      ),
    );
    assert.ok(mealOf(recipes, [recipeItem(2)]));
    assert.equal(mealOf([], [recipeItem(0)]), null);
  },
);

check(
  'a meal with an unreadable recipe, item, name or servings is refused whole',
  () => {
    assert.equal(mealOf([recipe({ title: '' })], [recipeItem(0)]), null);
    assert.equal(
      mealOf([recipe()], [recipeItem(0), { kind: 'DESSERT', servings: 1 }]),
      null,
    );
    assert.equal(mealOf([recipe()], [recipeItem(0), 'nope']), null);
    assert.equal(mealOf([recipe()], [recipeItem(0)], '  '), null);
    assert.equal(mealOf([recipe()], [recipeItem(0)], null), null);
    assert.equal(
      toSharedMeal({ recipes: [recipe()], items: [recipeItem(0)] }),
      null,
    );
    assert.equal(mealOf([recipe()], []), null);
    assert.equal(toSharedMeal(null), null);
    assert.equal(toSharedMeal({ name: 'x', recipes: 'no', items: 'no' }), null);
    [0, -1, Number.NaN, L.MAX_SERVING_AMOUNT + 1, '2', null].forEach(
      (servings) =>
        assert.equal(
          mealOf([recipe()], [recipeItem(0, servings)]),
          null,
          String(servings),
        ),
    );
    assert.equal(
      mealOf([recipe()], [recipeItem(0, L.MAX_SERVING_AMOUNT)])?.items[0]
        .servings,
      L.MAX_SERVING_AMOUNT,
    );
    assert.equal(
      mealOf(
        [recipe()],
        [
          recipeItem(0),
          { kind: 'INGREDIENT', servings: 1, name: '', catalogId: null },
        ],
      ),
      null,
    );
  },
);

check(
  'a meal holds at most the cap of items and recipes, and a recipe past the cap can no longer be pointed at',
  () => {
    const items = (count: number) =>
      mealOf(
        [recipe()],
        many(count, () => recipeItem(0)),
      )?.items.length;
    assert.equal(items(L.MAX_MEAL_ITEMS), L.MAX_MEAL_ITEMS);
    assert.equal(items(L.MAX_MEAL_ITEMS + 1), L.MAX_MEAL_ITEMS);
    const atCap = mealOf(
      many(L.MAX_SHARED_MEAL_RECIPES, () => recipe()),
      [recipeItem(L.MAX_SHARED_MEAL_RECIPES - 1)],
    );
    assert.equal(atCap?.recipes.length, L.MAX_SHARED_MEAL_RECIPES);
    const pastCap = mealOf(
      many(L.MAX_SHARED_MEAL_RECIPES + 1, () => recipe()),
      [recipeItem(L.MAX_SHARED_MEAL_RECIPES)],
    );
    assert.equal(pastCap, null);
    const keptCap = mealOf(
      many(L.MAX_SHARED_MEAL_RECIPES + 1, () => recipe()),
      [recipeItem(0)],
    );
    assert.equal(keptCap?.recipes.length, L.MAX_SHARED_MEAL_RECIPES);
  },
);

check(
  'a meal holds at most the cap of ingredient lines across its recipes and is refused one past it',
  () => {
    const withLines = (counts: number[]) =>
      mealOf(
        counts.map((count) =>
          recipe({ ingredients: many(count, () => ingredient()) }),
        ),
        counts.map((_, index) => recipeItem(index)),
      );
    const perRecipe = L.MAX_RECIPE_INGREDIENTS;
    const full = many(L.MAX_SHARED_MEAL_LINES / perRecipe, () => perRecipe);
    assert.ok(withLines(full), 'exactly the cap is shared');
    assert.equal(
      withLines([...full, 1]),
      null,
      'one line past the cap is refused, never cut',
    );
    assert.equal(
      withLines(many(L.MAX_SHARED_MEAL_RECIPES, () => perRecipe)),
      null,
    );
  },
);

check(
  'the covers a request names must sit inside the copy, be unique and use a safe recipe id',
  () => {
    const ref = (index: unknown, recipeId: unknown = 'recipe-1') => ({
      index,
      recipeId,
    });
    assert.deepEqual(toCoverRefs(undefined, 1), []);
    assert.deepEqual(toCoverRefs(null, 1), []);
    assert.deepEqual(toCoverRefs([ref(0)], 1), [
      { index: 0, recipeId: 'recipe-1' },
    ]);
    assert.deepEqual(toCoverRefs([ref(0, 'a'), ref(1, 'b')], 2)?.length, 2);
    assert.equal(toCoverRefs([ref(1)], 1), null, 'past the last recipe');
    assert.equal(toCoverRefs([ref(-1)], 2), null);
    assert.equal(toCoverRefs([ref(0.5)], 2), null);
    assert.equal(
      toCoverRefs([ref(0, 'a'), ref(0, 'b')], 2),
      null,
      'one cover per recipe',
    );
    ['../x', 'a/b', '', 'a b', 'a'.repeat(129), 7, null].forEach((recipeId) =>
      assert.equal(toCoverRefs([ref(0, recipeId)], 1), null, String(recipeId)),
    );
    assert.ok(toCoverRefs([ref(0, 'a'.repeat(128))], 1));
    assert.equal(toCoverRefs('covers', 1), null);
    assert.equal(toCoverRefs([null], 1), null);
    const cap = L.MAX_SHARED_MEAL_RECIPES;
    assert.equal(
      toCoverRefs(
        many(cap, (index) => ref(index, `r${index}`)),
        cap,
      )?.length,
      cap,
    );
    assert.equal(
      toCoverRefs(
        many(cap + 1, (index) => ref(index, `r${index}`)),
        cap + 1,
      ),
      null,
    );
  },
);

check("the unit list and every cap and list here equal the app's own", () => {
  assert.deepEqual([...SHARE_UNITS], clientConstants.UNITS);
  assert.deepEqual(
    [...SHARE_LINK_KINDS].sort(),
    Object.keys(clientConstants.RECIPE_LINK_LABELS).sort(),
  );
  const client: Record<string, unknown> = clientConstants;
  Object.entries(L).forEach(([name, value]) =>
    assert.equal(
      client[name],
      value,
      `${name} drifted from src/apps/pinch/constants.ts`,
    ),
  );
});

check('a tip keeps only its words and its step, never a date, id or cook', () => {
  const result = recipeOf({
    steps: ['One.', 'Two.'],
    tips: [
      {
        text: 'Pat it dry.',
        step: 1,
        id: 'note-id-secret',
        cookId: 'cook-secret',
        createdAt: 5,
        kind: 'NOTE',
      },
    ],
  });
  assert.deepEqual(result.tips, [{ text: 'Pat it dry.', step: 1 }]);
});

check('a tip step that is not a step of the recipe reads as the whole recipe', () => {
  const result = recipeOf({
    steps: ['One.'],
    tips: [
      { text: 'a', step: 1 },
      { text: 'b', step: -1 },
      { text: 'c', step: 0.5 },
      { text: 'd', step: '0' },
      { text: 'e', step: null },
    ],
  });
  assert.deepEqual(
    result.tips.map((tip) => tip.step),
    [null, null, null, null, null],
  );
});

check('tips are capped in number and length, and junk is dropped', () => {
  const result = recipeOf({
    tips: [
      ...many(L.MAX_SHARED_TIPS + 5, (index) => ({ text: `Tip ${index}`, step: null })),
      { text: '' },
      { text: 7 },
      null,
    ],
  });
  assert.equal(result.tips.length, L.MAX_SHARED_TIPS);
  const long = recipeOf({ tips: [{ text: text(L.MAX_SHARED_TIP_LENGTH + 1), step: null }] });
  assert.equal(long.tips[0]?.text.length, L.MAX_SHARED_TIP_LENGTH);
});

check('a copy taken before tips existed reads as having none', () => {
  const legacy = { ...recipe() } as Record<string, unknown>;
  delete legacy.tips;
  delete legacy.notes;
  assert.deepEqual(toSharedRecipe(legacy)?.tips, []);
  assert.deepEqual(toSharedRecipe(legacy)?.notes, []);
});

check('a note keeps only its words and its step, and is capped on its own limits', () => {
  const result = recipeOf({
    steps: ['One.', 'Two.'],
    notes: [
      { text: 'Better with less vinegar.', step: 1, id: 'secret', cookId: 'cook-secret', createdAt: 5, reason: 'why' },
      ...many(L.MAX_SHARED_NOTES + 5, (index) => ({ text: `Note ${index}`, step: null })),
      { text: '' },
      null,
    ],
  });
  assert.deepEqual(result.notes[0], { text: 'Better with less vinegar.', step: 1 });
  assert.equal(result.notes.length, L.MAX_SHARED_NOTES);
  const long = recipeOf({ notes: [{ text: text(L.MAX_SHARED_NOTE_LENGTH + 1), step: null }] });
  assert.equal(long.notes[0]?.text.length, L.MAX_SHARED_NOTE_LENGTH);
});

check('tips and notes are separate lists: one sent as the other stays where it was sent', () => {
  const result = recipeOf({ tips: [{ text: 'tip', step: null }], notes: [{ text: 'note', step: null }] });
  assert.deepEqual(result.tips.map((e) => e.text), ['tip']);
  assert.deepEqual(result.notes.map((e) => e.text), ['note']);
});

check('only an explicit true includes tips or notes, and the rest are stripped from every recipe', () => {
  const body = recipeOf({ tips: [{ text: 'tip', step: null }], notes: [{ text: 'note', step: null }] });
  const copy = { recipe: body, meal: { name: 'Dinner', recipes: [body], items: [] } };
  [undefined, null, 'true', 1, {}, false].forEach((odd) => {
    const includes = toShareIncludes(odd, odd);
    assert.deepEqual(includes, { tips: false, notes: false });
  });
  const none = toIncludedCopy(copy, toShareIncludes(false, false));
  assert.deepEqual([none.recipe?.tips, none.recipe?.notes, none.meal?.recipes[0]?.tips, none.meal?.recipes[0]?.notes], [[], [], [], []]);
  const tipsOnly = toIncludedCopy(copy, toShareIncludes(true, 'yes'));
  assert.equal(tipsOnly.recipe?.tips.length, 1);
  assert.equal(tipsOnly.recipe?.notes.length, 0);
  const notesOnly = toIncludedCopy(copy, toShareIncludes(undefined, true));
  assert.equal(notesOnly.meal?.recipes[0]?.tips.length, 0);
  assert.equal(notesOnly.meal?.recipes[0]?.notes.length, 1);
});

const idPatternIn = (rules: string, header: string) => {
  const start = rules.indexOf(header);
  assert.ok(start >= 0, `rules contain ${header}`);
  const found = /shareId\.matches\('([^']+)'\)/.exec(rules.slice(start));
  assert.ok(found, 'the rule checks the id with matches()');
  return new RegExp(found[1].replaceAll('\\\\', '\\'));
};

const fileNamePatternIn = (rules: string) => {
  const start = rules.indexOf('match /apps/pinch/shares/{shareId}/{fileName}');
  const found = /fileName\.matches\('([^']+)'\)/.exec(rules.slice(start));
  assert.ok(found, 'the storage rule checks the file name with matches()');
  return new RegExp(found[1].replaceAll('\\\\', '\\'));
};

check(
  "10,000 minted ids all match the Storage rule and the page's pattern, and none repeats",
  () => {
    const storagePattern = idPatternIn(
      storageRules,
      'match /apps/pinch/shares/{shareId}/{fileName}',
    );
    const ids = many(10_000, () => mintShareId());
    assert.equal(new Set(ids).size, ids.length, 'no id repeats');
    ids.forEach((id) => {
      assert.equal(id.length, L.SHARE_ID_LENGTH);
      assert.ok(storagePattern.test(id), id);
      assert.ok(isShareId(id), id);
    });
  },
);

check(
  'the id alphabet is exactly the 32 characters the rules accept, drawn evenly',
  () => {
    const storagePattern = idPatternIn(
      storageRules,
      'match /apps/pinch/shares/{shareId}/{fileName}',
    );
    const accepted = many(128, (code) => String.fromCharCode(code)).filter(
      (char) => storagePattern.test(char.repeat(L.SHARE_ID_LENGTH)),
    );
    assert.equal(
      accepted.length,
      32,
      '32 characters is 5 bits each, 130 bits in 26',
    );
    const counts = many(10_000, () => mintShareId())
      .join('')
      .split('')
      .reduce<Record<string, number>>(
        (tally, char) => ({ ...tally, [char]: (tally[char] ?? 0) + 1 }),
        {},
      );
    assert.deepEqual(
      Object.keys(counts).sort(),
      [...accepted].sort(),
      'every accepted character is used and nothing else',
    );
    const expected = (10_000 * L.SHARE_ID_LENGTH) / 32;
    Object.entries(counts).forEach(([char, count]) =>
      assert.ok(
        Math.abs(count - expected) < expected * 0.1,
        `${char} drawn ${count} times, expected about ${expected}`,
      ),
    );
    assert.equal(
      mintShareId(() => 0),
      '2'.repeat(L.SHARE_ID_LENGTH),
    );
    assert.equal(
      mintShareId((max) => max - 1),
      'z'.repeat(L.SHARE_ID_LENGTH),
    );
  },
);

check('malformed ids never pass the id test', () => {
  [
    '',
    'short',
    mintShareId().toUpperCase(),
    `${mintShareId()}a`,
    mintShareId().slice(1),
    `${mintShareId().slice(1)}0`,
    `${mintShareId().slice(1)}i`,
    `${mintShareId().slice(1)}o`,
    `${mintShareId().slice(1)}1`,
    `${mintShareId().slice(1)}/`,
    `${mintShareId().slice(1)}\n`,
    '../../kitchens/owner',
    7,
    null,
    undefined,
    {},
  ].forEach((value) => assert.equal(isShareId(value), false, String(value)));
});

check(
  'the cover paths a share uses are the ones the Storage rule allows and the Firestore rule expects',
  () => {
    const fileName = fileNamePatternIn(storageRules);
    many(L.MAX_SHARED_MEAL_RECIPES, (index) => index).forEach((index) => {
      assert.ok(fileName.test(`cover-${index}.webp`), `cover-${index}.webp`);
      assert.equal(
        shareCoverPath('abc', index),
        `apps/pinch/shares/abc/cover-${index}.webp`,
      );
    });
    [
      'cover-100.webp',
      'cover-.webp',
      'cover-1.png',
      'cover-1.webp.exe',
      'photo-1.webp',
      '../cover-1.webp',
    ].forEach((name) => assert.equal(fileName.test(name), false, name));
    assert.equal(
      kitchenCoverPath('u1', 'r1'),
      'apps/pinch/kitchens/u1/recipes/r1/cover.webp',
    );
    assert.ok(
      firestoreRules.includes(
        "data.coverPath == 'apps/pinch/kitchens/' + uid + '/recipes/' + id + '/cover.webp'",
      ),
      'the recipe rule accepts the path a copied cover is written to',
    );
  },
);

const block = (rules: string, header: string) => {
  const start = rules.indexOf(header);
  assert.ok(start >= 0, `rules contain ${header}`);
  const end = rules.indexOf('\n    }', start);
  return rules.slice(start, end);
};

check(
  'the rules give a visitor nothing: the owner reads their own share, no client writes, nobody reads a copy, covers are get-only',
  () => {
    const shares = block(firestoreRules, 'match /apps/pinch/shares/{shareId}');
    assert.ok(
      shares.includes(
        'allow read: if request.auth != null && resource.data.ownerUid == request.auth.uid;',
      ),
    );
    assert.ok(shares.includes('allow write: if false;'));
    assert.ok(!/allow (create|update|delete)/.test(shares));
    const snapshots = block(
      firestoreRules,
      'match /apps/pinch/shareSnapshots/{shareId}',
    );
    assert.ok(snapshots.includes('allow read, write: if false;'));
    assert.ok(!snapshots.includes('request.auth'));
    const covers = block(
      storageRules,
      'match /apps/pinch/shares/{shareId}/{fileName}',
    );
    assert.ok(covers.includes('allow get:'));
    assert.ok(covers.includes('allow list, write: if false;'));
    assert.ok(!/allow (read|create|update|delete)/.test(covers));
  },
);

const OWNER = 'owner-uid-XYZ-0123456789';
const SOURCE = 'source-recipe-secret-id';
const stored = (extra: Record<string, unknown> = {}) => ({
  share: {
    id: 'x',
    ownerUid: OWNER,
    kind: 'RECIPE',
    sourceId: SOURCE,
    title: 'Adobo chicken',
    sourceUpdatedAt: 5,
    createdAt: 1,
    updatedAt: 2_000,
    ...extra,
  },
  snapshot: {
    id: 'x',
    kind: 'RECIPE',
    recipe: recipeOf(),
    meal: null,
    updatedAt: 2_000,
  },
});

check(
  'isOwner is true only for the matching uid, never for a signed-out or empty caller',
  () => {
    assert.equal(isShareOwner(OWNER, OWNER), true);
    assert.equal(isShareOwner(OWNER, 'someone-else'), false);
    assert.equal(isShareOwner(OWNER, undefined), false);
    assert.equal(isShareOwner(OWNER, ''), false);
    assert.equal(isShareOwner(undefined, undefined), false);
    assert.equal(isShareOwner('', ''), false);
    assert.equal(isShareOwner(null, undefined), false);
    assert.equal(isShareOwner(OWNER, OWNER.toUpperCase()), false);
  },
);

check(
  "what a visitor receives never holds the owner's uid or source id, and the owner alone gets their source id",
  () => {
    const { share, snapshot } = stored();
    const keys = [
      'isOwner',
      'kind',
      'meal',
      'ownerSourceId',
      'recipe',
      'sharedAt',
      'status',
    ];
    const signedOut = toShareResult(share, snapshot, undefined);
    const stranger = toShareResult(share, snapshot, 'visitor-uid');
    const owner = toShareResult(share, snapshot, OWNER);
    [signedOut, stranger, owner].forEach((result) =>
      assert.deepEqual(Object.keys(result).sort(), keys),
    );
    [signedOut, stranger].forEach((result) => {
      const body = JSON.stringify(result);
      assert.ok(!body.includes(OWNER));
      assert.ok(!body.includes(SOURCE));
      assert.ok(!body.includes('ownerUid'));
      assert.ok(!body.includes('sourceId'));
      assert.ok(
        result.status === 'ok' &&
          result.isOwner === false &&
          result.ownerSourceId === null,
      );
    });
    assert.ok(
      owner.status === 'ok' &&
        owner.isOwner === true &&
        owner.ownerSourceId === SOURCE,
    );
    assert.ok(
      !JSON.stringify(owner).includes(OWNER),
      'even the owner is not sent their uid',
    );
    assert.ok(
      signedOut.status === 'ok' &&
        signedOut.sharedAt === 2_000 &&
        signedOut.kind === 'RECIPE' &&
        signedOut.meal === null,
    );
  },
);

check('a stored copy edited by hand is cleaned again when it is served', () => {
  const { share } = stored();
  const dirty = {
    id: 'x',
    kind: 'RECIPE',
    updatedAt: 2_000,
    meal: null,
    recipe: {
      ...recipe({ hasCover: true }),
      ownerUid: OWNER,
      priceCents: 9,
      coverUrl: 'https://tracker.example/p.png',
      links: [{ kind: 'OTHER', url: 'http://example.com/x' }],
    },
  };
  const result = toShareResult(share, dirty, 'visitor-uid');
  assert.ok(result.status === 'ok' && result.recipe);
  const body = JSON.stringify(result);
  [
    'priceCents',
    'coverUrl',
    'tracker.example',
    'http://example.com',
    OWNER,
  ].forEach((forbidden) => assert.ok(!body.includes(forbidden), forbidden));
  assert.equal(
    result.recipe.hasCover,
    true,
    "the server's recorded cover is kept",
  );
});

check(
  'a malformed, missing, mismatched or unreadable share all answer with the same one body',
  () => {
    const { share, snapshot } = stored();
    const answers = [
      toShareResult(undefined, undefined, 'a'),
      toShareResult(share, undefined, 'a'),
      toShareResult(undefined, snapshot, 'a'),
      toShareResult(null, null, undefined),
      toShareResult(share, { ...snapshot, kind: 'MEAL' }, 'a'),
      toShareResult({ ...share, kind: 'SOUP' }, snapshot, 'a'),
      toShareResult({ ...share, updatedAt: 'yesterday' }, snapshot, 'a'),
      toShareResult({ ...share, updatedAt: Number.NaN }, snapshot, 'a'),
      toShareResult(
        share,
        { ...snapshot, recipe: { title: 'No servings' } },
        'a',
      ),
      toShareResult(share, { ...snapshot, recipe: null }, OWNER),
      toShareResult(
        { ...share, kind: 'MEAL' },
        { ...snapshot, kind: 'MEAL', meal: null },
        'a',
      ),
    ].map((result) => JSON.stringify(result));
    assert.ok(
      answers.every((answer) => answer === '{"status":"not_found"}'),
      answers.join('\n'),
    );
  },
);

check(
  'a recipe share serves only its recipe and a meal share only its meal, whatever else the copy holds',
  () => {
    const { share, snapshot } = stored();
    const both = {
      ...snapshot,
      meal: { name: 'Leak', recipes: [recipe()], items: [recipeItem(0)] },
    };
    const recipeResult = toShareResult(share, both, 'a');
    assert.ok(
      recipeResult.status === 'ok' &&
        recipeResult.meal === null &&
        recipeResult.recipe !== null,
    );
    const mealShare = { ...share, kind: 'MEAL' };
    const mealResult = toShareResult(mealShare, { ...both, kind: 'MEAL' }, 'a');
    assert.ok(
      mealResult.status === 'ok' &&
        mealResult.recipe === null &&
        mealResult.meal?.name === 'Leak',
    );
  },
);

check(
  'the seeded shares have ids the rules accept and pass the same path a visitor takes',
  () => {
    const pattern = idPatternIn(
      storageRules,
      'match /apps/pinch/shares/{shareId}/{fileName}',
    );
    Object.values(SEED_SHARE_IDS).forEach((id) =>
      assert.ok(pattern.test(id), id),
    );
    const seeded = buildSeedShares(OWNER, 1_700_000_000_000, true);
    assert.equal(seeded.length, 2);
    const [recipeShare, mealShare] = seeded.map(({ share, snapshot }) =>
      toShareResult(share, snapshot, 'visitor-uid'),
    );
    assert.ok(
      recipeShare.status === 'ok' &&
        recipeShare.recipe?.title === 'Adobo chicken' &&
        recipeShare.recipe.hasCover,
    );
    assert.ok(
      mealShare.status === 'ok' &&
        mealShare.meal?.recipes.length === 2 &&
        mealShare.meal.items.length === 2,
    );
    seeded.forEach(({ share, snapshot }) => {
      const body = JSON.stringify(
        toShareResult(share, snapshot, 'visitor-uid'),
      );
      assert.ok(
        !body.includes(OWNER) && !body.includes(share.sourceId),
        share.id,
      );
    });
    const withoutCover = buildSeedShares(OWNER, 1_700_000_000_000, false);
    const plain = toShareResult(
      withoutCover[0].share,
      withoutCover[0].snapshot,
      undefined,
    );
    assert.ok(plain.status === 'ok' && plain.recipe?.hasCover === false);
  },
);

console.log(`pinch share checks passed (${passed})`);
