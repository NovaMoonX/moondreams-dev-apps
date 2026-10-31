import assert from 'node:assert/strict';

import {
  MAX_SHARED_MEAL_LINES,
  MAX_SHARED_MEAL_RECIPES,
  MAX_SHARED_TIPS,
} from '../../src/apps/pinch/constants.ts';
import type {
  Meal,
  MealItem,
  PinchShare,
  Recipe,
  RecipeIngredient,
  RecipeNote,
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
import { getStepAnchorText } from '../../src/apps/pinch/utils/notes.ts';

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
  categories: [],
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
    'notes',
    'prepMinutes',
    'servings',
    'steps',
    'tips',
    'title',
  ]);
});

// ---- Tips travel with a recipe, and only their words and step ----
const tipOf = (id: string, text: string | null, extra: Partial<RecipeNote> = {}): RecipeNote => ({
  id,
  recipeId: 'r-owner-1',
  kind: 'TIP',
  text,
  changes: [],
  cookId: null,
  stepIndex: null,
  stepText: null,
  reason: null,
  previous: null,
  createdAt: 10,
  updatedAt: 10,
  ...extra,
});
const stepAnchor = (index: number) => ({
  stepIndex: index,
  stepText: getStepAnchorText(full.steps[index]),
});
const notesOfFull: RecipeNote[] = [
  tipOf('t-late', 'Rest it.', { ...stepAnchor(1), createdAt: 30, updatedAt: 40 }),
  tipOf('t-whole', 'Make it a day ahead.', { createdAt: 20 }),
  tipOf('t-early', 'Salt the beef.', { ...stepAnchor(0), createdAt: 5 }),
  tipOf('t-lost', 'Gone step.', { stepIndex: 0, stepText: 'a step that was rewritten', createdAt: 25 }),
  tipOf('t-blank', '   '),
  { ...tipOf('n-note', 'PRIVATE-NOTE'), kind: 'NOTE' },
  { ...tipOf('n-change', 'PRIVATE-CHANGE', { reason: 'PRIVATE-REASON' }), kind: 'CHANGE' },
  {
    ...tipOf('n-tweak', null, {
      changes: ['PRIVATE-LINE'],
      previous: {
        title: 'PRIVATE-PREVIOUS',
        description: null,
        servings: 4,
        prepMinutes: null,
        cookMinutes: null,
        ingredients: [],
        steps: ['PRIVATE-PREVIOUS-STEP'],
        nutritionOverride: null,
        sourceId: null,
      },
    }),
    kind: 'TWEAK',
  },
];
const TIPS = { tips: true, notes: false };
const NOTES = { tips: false, notes: true };
const BOTH = { tips: true, notes: true };
const shareRecord = (sourceUpdatedAt: number, includes: { tips: boolean; notes: boolean }): PinchShare => ({
  id: 'abcdefghjkmnpqrstuvwxyz234',
  ownerUid: 'owner-uid',
  kind: 'RECIPE',
  sourceId: 'r-owner-1',
  title: 'Anything',
  sourceUpdatedAt,
  includesTips: includes.tips,
  includesNotes: includes.notes,
  createdAt: 1,
  updatedAt: 1,
});
const withTipsShared = buildSharedRecipe(full, ingredientsById, notesOfFull, TIPS);

check('a recipe copy carries its tips in step order, as words and a step only', () => {
  assert.deepEqual(withTipsShared.tips, [
    { text: 'Make it a day ahead.', step: null },
    { text: 'Gone step.', step: null },
    { text: 'Salt the beef.', step: 0 },
    { text: 'Rest it.', step: 1 },
  ]);
  const text = JSON.stringify(withTipsShared);
  ['PRIVATE-NOTE', 'PRIVATE-CHANGE', 'PRIVATE-REASON', 'PRIVATE-LINE', 'PRIVATE-PREVIOUS', 'previous', 't-late', 'cookId', 'createdAt'].forEach(
    (marker) => assert.ok(!text.includes(marker), `"${marker}" leaked into the copy`),
  );
});

check('a recipe with no tips shares an empty list, and tips are only carried when included', () => {
  assert.deepEqual(buildSharedRecipe(full, ingredientsById).tips, []);
  assert.deepEqual(buildSharedRecipe(full, ingredientsById, notesOfFull).tips, []);
  assert.deepEqual(buildSharedRecipe(full, ingredientsById, notesOfFull, NOTES).tips, []);
});

check('notes are carried only when included, as words and a step, and never a change or tweak', () => {
  assert.deepEqual(buildSharedRecipe(full, ingredientsById, notesOfFull, TIPS).notes, []);
  const result = buildSharedRecipe(full, ingredientsById, notesOfFull, NOTES);
  assert.deepEqual(result.notes, [{ text: 'PRIVATE-NOTE', step: null }]);
  assert.deepEqual(result.tips, []);
  const text = JSON.stringify(result);
  ['PRIVATE-CHANGE', 'PRIVATE-REASON', 'PRIVATE-LINE', 'PRIVATE-PREVIOUS', 'previous'].forEach((marker) =>
    assert.ok(!text.includes(marker), `"${marker}" leaked into the copy`),
  );
  assert.equal(buildSharedRecipe(full, ingredientsById, notesOfFull, BOTH).tips.length, 4);
});

check("a recipe's stamp follows the entries a share includes, and nothing else in the journal", () => {
  const source: ShareSource = { kind: 'RECIPE', recipe: full };
  const stamp = (notes: RecipeNote[], includes: { tips: boolean; notes: boolean }) =>
    getShareSourceStamp(source, new Map(), new Map([['r-owner-1', notes]]), includes);
  assert.equal(stamp(notesOfFull, TIPS), Math.max(full.updatedAt, 40) + 4);
  assert.equal(stamp(notesOfFull, { tips: false, notes: false }), full.updatedAt);
  assert.equal(stamp([{ ...notesOfFull[6], updatedAt: 99999 }], BOTH), full.updatedAt);
  assert.equal(stamp([{ ...notesOfFull[5], updatedAt: 99999 }], TIPS), full.updatedAt);
  assert.equal(stamp([{ ...notesOfFull[5], updatedAt: 99999 }], NOTES), 99999 + 1);
});

check('deleting an included entry changes the stamp, so the link reads as changed', () => {
  const source: ShareSource = { kind: 'RECIPE', recipe: full };
  const notesBy = (notes: RecipeNote[]) => new Map([['r-owner-1', notes]]);
  const taken = shareRecord(getShareSourceStamp(source, new Map(), notesBy(notesOfFull), TIPS), TIPS);
  const recipes = new Map([['r-owner-1', full]]);
  assert.equal(getShareStatus(taken, recipes, new Map(), notesBy(notesOfFull)).isStale, false);
  const withoutOne = notesOfFull.filter((note) => note.id !== 't-early');
  assert.equal(getShareStatus(taken, recipes, new Map(), notesBy(withoutOne)).isStale, true);
  const noteDeleted = notesOfFull.filter((note) => note.id !== 'n-note');
  assert.equal(getShareStatus(taken, recipes, new Map(), notesBy(noteDeleted)).isStale, false);
});

check('entries beyond the share caps do not move the stamp, and a link is not read as changed while notes load', () => {
  const source: ShareSource = { kind: 'RECIPE', recipe: full };
  const many = Array.from({ length: MAX_SHARED_TIPS + 5 }, (_, index) =>
    tipOf(`cap-${index}`, `Tip ${index}`, { createdAt: index, updatedAt: index }),
  );
  const stamp = (notes: RecipeNote[]) =>
    getShareSourceStamp(source, new Map(), new Map([['r-owner-1', notes]]), TIPS);
  const edited = many.map((tip, index) =>
    index === many.length - 1 ? { ...tip, updatedAt: 99999 } : tip,
  );
  assert.equal(stamp(edited), stamp(many), 'a tip past the cap is not in the copy');
  const taken = shareRecord(stamp(many), TIPS);
  const recipes = new Map([['r-owner-1', full]]);
  assert.equal(getShareStatus(taken, recipes, new Map(), new Map(), false).isStale, false);
  assert.equal(getShareStatus(taken, recipes, new Map(), new Map(), true).isStale, true);
});

check('a link made before the choice existed carries no entries, and an entry added to it never marks it changed', () => {
  const legacy = shareRecord(full.updatedAt, TIPS) as unknown as Record<string, unknown>;
  delete legacy.includesTips;
  delete legacy.includesNotes;
  const recipes = new Map([['r-owner-1', full]]);
  const notes = new Map([['r-owner-1', notesOfFull]]);
  assert.equal(getShareStatus(legacy as unknown as PinchShare, recipes, new Map(), notes).isStale, false);
});

check('more tips than a share holds are cut to the cap, oldest kept', () => {
  const many = Array.from({ length: MAX_SHARED_TIPS + 4 }, (_, index) =>
    tipOf(`m-${index}`, `Tip ${index}`, { createdAt: index }),
  );
  const result = buildSharedRecipe(full, ingredientsById, many, TIPS);
  assert.equal(result.tips.length, MAX_SHARED_TIPS);
  assert.equal(result.tips[0].text, 'Tip 0');
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
  categories: [],
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
  includesTips: false,
  includesNotes: false,
  createdAt: 1,
  updatedAt: 1,
});

check('a payload says what it carries, and a recipe in a meal follows the same choice', () => {
  const notesByRecipe = new Map([['alpha', [
    { ...tipOf('p-tip', 'A tip'), recipeId: 'alpha' },
    { ...tipOf('p-note', 'A note'), recipeId: 'alpha', kind: 'NOTE' as const },
  ]]]);
  const build = (source: ShareSource, includes: { tips: boolean; notes: boolean }) => {
    const payload = buildSharePayload(source, recipesById, ingredientsById, notesByRecipe, includes);
    assert.ok(!('error' in payload));
    return payload as Exclude<typeof payload, { error: string }>;
  };
  const off = build(mealSource, { tips: false, notes: false });
  assert.deepEqual([off.includesTips, off.includesNotes], [false, false]);
  assert.ok(off.meal?.recipes.every((r) => r.tips.length === 0 && r.notes.length === 0));
  const tipsOnly = build(mealSource, TIPS);
  assert.deepEqual([tipsOnly.includesTips, tipsOnly.includesNotes], [true, false]);
  assert.ok(tipsOnly.meal?.recipes.some((r) => r.tips.length === 1));
  assert.ok(tipsOnly.meal?.recipes.every((r) => r.notes.length === 0));
  const notesOnly = build(recipeSource, NOTES);
  assert.deepEqual(notesOnly.recipe?.notes, [{ text: 'A note', step: null }]);
  assert.deepEqual(notesOnly.recipe?.tips, []);
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
