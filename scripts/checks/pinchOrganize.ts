import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COLLECTION_BATCH_SIZE,
  COLLECTION_FILTER_ANY,
  COLLECTION_FILTER_NONE,
  HIGH_PROTEIN_GRAMS,
  MAX_COLLECTION_LABEL_LENGTH,
  MAX_COLLECTIONS,
  MAX_RECIPE_COLLECTIONS,
  QUICK_MAX_MINUTES,
} from '../../src/apps/pinch/constants.ts';
import type {
  Collection,
  NutritionValues,
  Recipe,
  ResolvedIngredient,
  Source,
} from '../../src/apps/pinch/types.ts';
import {
  buildRecipeSearchIndex,
  searchRecipes,
} from '../../src/apps/pinch/utils/catalogSearch.ts';
import {
  addCollectionByLabel,
  EMPTY_COLLECTIONS_CHOICE,
  filterByCollection,
  findCollectionByLabel,
  getChoiceLabels,
  getCollectionsPill,
  getCollectionCounts,
  getCollectionFilterOptions,
  getCollectionKey,
  getAddedToCollectionsText,
  getAddToCollectionsLabel,
  getChunks,
  getCollectionChange,
  getCollectionsToSave,
  getInitialCollectionsChoice,
  getNothingAddedText,
  getRecipeCollections,
  getRecipeSelectionNote,
  getRecipeSelectionTitle,
  getRemovalChunks,
  getSuggestedCollections,
  getTrustedProtein,
  getUndoAddText,
  planAddToCollections,
  planRemoveFromCollections,
  toggleCollection,
  withoutCollection,
  type CollectionsChoice,
  type SuggestionSource,
} from '../../src/apps/pinch/utils/collections.ts';
import {
  isStarred,
  shouldIgnoreStarTap,
  sortFavoritesFirst,
} from '../../src/apps/pinch/utils/favorites.ts';
import { rankRecentPicks } from '../../src/apps/pinch/utils/planPicks.ts';

const collection = (id: string, label: string): Collection => ({
  id,
  label,
  createdAt: 0,
  updatedAt: 0,
});
const hp = collection('c-hp', 'High-protein');
const week = collection('c-week', 'Weeknight');
const bulk = collection('c-bulk', 'Bulk');
const all = [bulk, hp, week];

const recipeIn = (id: string, ids: string[] | undefined) =>
  ({ id, ...(ids === undefined ? {} : { collectionIds: ids }) }) as {
    id: string;
    collectionIds?: string[];
  };

// ---- Labels: one collection whatever the case, spacing or hyphen ----
{
  assert.equal(getCollectionKey(' High-Protein '), 'highprotein');
  assert.equal(
    getCollectionKey('high protein'),
    getCollectionKey('High-protein'),
  );
  assert.equal(getCollectionKey('Week_night!'), 'weeknight');
  assert.equal(
    getCollectionKey('🍝'),
    '🍝',
    'a label of only symbols keeps itself',
  );
  assert.notEqual(getCollectionKey('🍝'), getCollectionKey('🥗'));
  assert.equal(getCollectionKey('Été'), 'été', 'letters beyond ASCII stay');
  assert.equal(findCollectionByLabel(all, 'high protein')?.id, 'c-hp');
  assert.equal(
    findCollectionByLabel(all, 'High-protein', 'c-hp'),
    null,
    'a rename may keep its own name',
  );
  assert.equal(findCollectionByLabel(all, 'Brunch'), null);
}

// ---- A recipe's collections: a missing key, an unknown id and a duplicate id all read safely ----
{
  assert.deepEqual(
    getRecipeCollections(
      recipeIn('a', ['c-week', 'gone', 'c-hp', 'c-hp']),
      all,
    ).map((c) => c.id),
    ['c-hp', 'c-week'],
    'in the order of the list given, an id no collection has is ignored and a repeat is one',
  );
  assert.deepEqual(
    getRecipeCollections(recipeIn('legacy', undefined), all),
    [],
    'a recipe from before collections is in none',
  );
  assert.deepEqual(getRecipeCollections({ collectionIds: null }, all), []);

  const counts = getCollectionCounts(
    [
      recipeIn('a', ['c-hp', 'c-week']),
      recipeIn('b', ['c-hp']),
      recipeIn('c', []),
      recipeIn('legacy', undefined),
      recipeIn('stale', ['gone']),
    ],
    all,
  );
  assert.equal(counts.byCollection.get('c-hp'), 2);
  assert.equal(counts.byCollection.get('c-week'), 1);
  assert.equal(
    counts.byCollection.has('c-bulk'),
    false,
    'a collection with no recipe has no count',
  );
  assert.equal(
    counts.withoutCollection,
    3,
    'none, a legacy recipe and one that only names a deleted collection are in no collection',
  );
}

// ---- The filter lists only what is present, with counts ----
{
  const counts = getCollectionCounts(
    [
      recipeIn('a', ['c-hp']),
      recipeIn('b', ['c-hp', 'c-week']),
      recipeIn('c', undefined),
    ],
    all,
  );
  assert.deepEqual(
    getCollectionFilterOptions(all, counts, COLLECTION_FILTER_ANY),
    [
      { value: COLLECTION_FILTER_ANY, label: 'Any' },
      { value: 'c-hp', label: 'High-protein · 2' },
      { value: 'c-week', label: 'Weeknight · 1' },
      { value: COLLECTION_FILTER_NONE, label: 'No collection · 1' },
    ],
    'Bulk holds nothing, so it is not offered; the count is per collection and "No collection" counts the rest',
  );
  assert.deepEqual(
    getCollectionFilterOptions(all, counts, 'c-bulk').map(
      (option) => option.label,
    ),
    [
      'Any',
      'Bulk · 0',
      'High-protein · 2',
      'Weeknight · 1',
      'No collection · 1',
    ],
    'the collection that is picked stays while it is empty, so the pills never read as broken',
  );
  const everyOne = getCollectionCounts([recipeIn('a', ['c-hp'])], all);
  assert.equal(
    getCollectionFilterOptions(all, everyOne, COLLECTION_FILTER_ANY).some(
      (o) => o.value === COLLECTION_FILTER_NONE,
    ),
    false,
    '"No collection" waits until some recipe is in none',
  );
  assert.equal(
    getCollectionFilterOptions(all, everyOne, COLLECTION_FILTER_NONE).some(
      (o) => o.value === COLLECTION_FILTER_NONE,
    ),
    true,
    'but stays while it is the picked answer',
  );

  const recipes = [
    recipeIn('a', ['c-hp']),
    recipeIn('b', ['c-hp', 'c-week']),
    recipeIn('c', undefined),
    recipeIn('d', ['gone']),
  ];
  const ids = (list: { id: string }[]) => list.map((r) => r.id);
  assert.deepEqual(
    ids(filterByCollection(recipes, COLLECTION_FILTER_ANY, all)),
    ['a', 'b', 'c', 'd'],
  );
  assert.deepEqual(ids(filterByCollection(recipes, 'c-hp', all)), ['a', 'b']);
  assert.deepEqual(ids(filterByCollection(recipes, 'c-week', all)), ['b']);
  assert.deepEqual(
    ids(filterByCollection(recipes, COLLECTION_FILTER_NONE, all)),
    ['c', 'd'],
    'a legacy recipe and one naming a deleted collection are in none',
  );
  assert.deepEqual(ids(filterByCollection(recipes, 'c-bulk', all)), []);
  assert.equal(
    counts.withoutCollection,
    filterByCollection(recipes.slice(0, 3), COLLECTION_FILTER_NONE, all).length,
    'the count on "No collection" is what that filter then shows',
  );
}

// ---- The drawer's collections are one pill: the name when there is one, a count when there are more ----
{
  assert.deepEqual(getCollectionsPill([]), { kind: 'none', label: null });
  assert.deepEqual(
    getCollectionsPill(['Weeknight']),
    { kind: 'one', label: 'Weeknight' },
    'one collection is named',
  );
  assert.deepEqual(
    getCollectionsPill(['Bulk', 'Weeknight']),
    { kind: 'many', label: 'In 2 collections' },
    'two are counted, so the pill never grows with their names',
  );
  assert.equal(
    getCollectionsPill(Array.from({ length: 20 }, (_, i) => `C${i}`)).label,
    'In 20 collections',
    'the most a recipe can name still reads in one short pill',
  );
}

// ---- Suggestions come from the recipe's own numbers ----
{
  const suggest = (
    over: Partial<SuggestionSource>,
    collections: Collection[] = [],
    memberIds: string[] = [],
  ) =>
    getSuggestedCollections(
      {
        protein: null,
        prepMinutes: null,
        cookMinutes: null,
        freezerDays: null,
        ...over,
      },
      collections,
      memberIds,
    ).map((entry) => entry.label);

  assert.equal(HIGH_PROTEIN_GRAMS, 25);
  assert.deepEqual(
    suggest({ protein: 25 }),
    ['High-protein'],
    'at the threshold',
  );
  assert.deepEqual(
    suggest({ protein: 24.5 }),
    ['High-protein'],
    '24.5 g shows as 25 g, so it counts',
  );
  assert.deepEqual(
    suggest({ protein: 24.4 }),
    [],
    '24.4 g shows as 24 g, below it',
  );
  assert.deepEqual(suggest({ protein: 80 }), ['High-protein']);
  assert.deepEqual(suggest({ protein: 0 }), []);
  assert.deepEqual(
    suggest({ protein: null }),
    [],
    'unknown protein suggests nothing',
  );

  assert.equal(QUICK_MAX_MINUTES, 30);
  assert.deepEqual(
    suggest({ prepMinutes: 10, cookMinutes: 20 }),
    ['Quick'],
    'prep plus cook at the limit',
  );
  assert.deepEqual(
    suggest({ prepMinutes: 10, cookMinutes: 21 }),
    [],
    'one minute over',
  );
  assert.deepEqual(
    suggest({ prepMinutes: 5, cookMinutes: null }),
    [],
    'a cook time nobody gave is not zero',
  );
  assert.deepEqual(
    suggest({ prepMinutes: null, cookMinutes: 10 }),
    [],
    'neither is a missing prep time',
  );
  assert.deepEqual(
    suggest({ prepMinutes: 0, cookMinutes: 0 }),
    [],
    'two zeros are no times at all',
  );
  assert.deepEqual(suggest({ prepMinutes: 0, cookMinutes: 15 }), ['Quick']);

  assert.deepEqual(suggest({ freezerDays: 90 }), ['Freezer-friendly']);
  assert.deepEqual(suggest({ freezerDays: null }), []);

  assert.deepEqual(
    suggest({ protein: 40, prepMinutes: 5, cookMinutes: 10, freezerDays: 30 }),
    ['High-protein', 'Quick', 'Freezer-friendly'],
    'in a fixed order',
  );

  const already = suggest({ protein: 40, freezerDays: 30 }, all, ['c-hp']);
  assert.deepEqual(
    already,
    ['Freezer-friendly'],
    'a collection the recipe is already in is not suggested again',
  );
  assert.deepEqual(
    suggest({ protein: 40 }, [collection('c-hp2', 'high protein')], ['c-hp2']),
    [],
    "the person's own spelling counts as the same collection",
  );

  const joins = getSuggestedCollections(
    { protein: 40, prepMinutes: null, cookMinutes: null, freezerDays: null },
    [collection('c-hp2', 'High protein')],
    [],
  );
  assert.deepEqual(
    joins,
    [{ label: 'High protein', collectionId: 'c-hp2' }],
    'it joins the collection that exists, under the name the person gave it',
  );
  assert.deepEqual(
    getSuggestedCollections(
      { protein: 40, prepMinutes: null, cookMinutes: null, freezerDays: null },
      [],
      [],
    ),
    [{ label: 'High-protein', collectionId: null }],
    'with none of that name it would make one',
  );

  const full = Array.from({ length: MAX_COLLECTIONS }, (_, index) =>
    collection(`x${index}`, `Set ${index}`),
  );
  assert.deepEqual(
    suggest({ protein: 40 }, full),
    [],
    'a new collection that cannot be made is not suggested',
  );
  assert.deepEqual(
    suggest({ protein: 40 }, [...full.slice(1), hp]),
    ['High-protein'],
    'but one that exists can still be joined at the cap',
  );
}

// ---- The protein a suggestion may read ----
{
  const calc = (protein: number | null, missingProtein: boolean) => ({
    values: { calories: 300, protein, carbs: 10, fat: 5 } as NutritionValues,
    missing: missingProtein
      ? [{ ingredientId: 'x', metric: 'protein' as const }]
      : [{ ingredientId: 'y', metric: 'fat' as const }],
  });
  assert.equal(
    getTrustedProtein(calc(30, false), null),
    30,
    'complete protein is trusted',
  );
  assert.equal(
    getTrustedProtein(calc(30, true), null),
    null,
    'an ingredient with no protein value makes the sum a guess',
  );
  assert.equal(
    getTrustedProtein(calc(30, false), {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
    }),
    30,
  );
  assert.equal(
    getTrustedProtein(calc(5, true), {
      calories: null,
      protein: 40,
      carbs: null,
      fat: null,
    }),
    40,
    "the person's own number wins",
  );
  assert.equal(
    getTrustedProtein(calc(null, false), null),
    null,
    'nothing to add up is unknown, not zero',
  );
  assert.equal(
    getTrustedProtein(calc(30, false), {
      calories: 100,
      protein: null,
      carbs: null,
      fat: null,
    }),
    30,
    'a typed calories figure does not touch protein',
  );
}

// ---- The form's choice: pick, unpick, type a new one ----
{
  const none: CollectionsChoice = EMPTY_COLLECTIONS_CHOICE;
  const picked = toggleCollection(none, 'c-hp');
  assert.deepEqual(picked.choice.ids, ['c-hp']);
  assert.equal(picked.outcome, 'ok');
  assert.deepEqual(
    toggleCollection(picked.choice, 'c-hp').choice.ids,
    [],
    'a second tap unpicks',
  );
  assert.deepEqual(none.ids, [], 'the starting choice is never changed');

  const newIds = Array.from(
    { length: 10 },
    (_, index) => `new-${index + 1}`,
  ).values();
  const makeId = () => newIds.next().value as string;
  const typed = addCollectionByLabel(none, all, '  Meal prep ', makeId);
  assert.equal(typed.outcome, 'ok');
  assert.deepEqual(typed.choice.added, [{ id: 'new-1', label: 'Meal prep' }]);
  assert.deepEqual(typed.choice.ids, ['new-1'], 'a new one starts picked');

  const again = addCollectionByLabel(typed.choice, all, 'meal-prep', makeId);
  assert.equal(
    again.outcome,
    'already',
    'the same name typed again is the one already there',
  );
  assert.deepEqual(again.choice, typed.choice);

  const existing = addCollectionByLabel(none, all, 'weeknight', makeId);
  assert.deepEqual(
    existing.choice,
    { ids: ['c-week'], added: [] },
    'a typed name that exists picks it and makes nothing',
  );
  assert.equal(addCollectionByLabel(none, all, '   ', makeId).outcome, 'empty');

  const unpicked = toggleCollection(typed.choice, 'new-1');
  assert.deepEqual(
    unpicked.choice,
    { ids: [], added: [] },
    'unpicking a new one takes it out of what is written',
  );

  const manyIds = Array.from(
    { length: MAX_RECIPE_COLLECTIONS },
    (_, index) => `id-${index}`,
  );
  const fullRecipe: CollectionsChoice = { ids: manyIds, added: [] };
  assert.equal(toggleCollection(fullRecipe, 'c-hp').outcome, 'recipeFull');
  assert.deepEqual(toggleCollection(fullRecipe, 'c-hp').choice, fullRecipe);
  assert.equal(
    addCollectionByLabel(fullRecipe, all, 'Brand new', makeId).outcome,
    'recipeFull',
  );
  assert.equal(
    toggleCollection(fullRecipe, 'id-3').outcome,
    'ok',
    'a recipe at its cap can still drop one',
  );

  const manyCollections = Array.from({ length: MAX_COLLECTIONS }, (_, index) =>
    collection(`x${index}`, `Set ${index}`),
  );
  assert.equal(
    addCollectionByLabel(none, manyCollections, 'One more', makeId).outcome,
    'collectionsFull',
  );
  assert.equal(
    addCollectionByLabel(none, manyCollections, 'set 3', makeId).outcome,
    'ok',
    'at the cap a name that exists is still picked',
  );

  assert.deepEqual(
    getChoiceLabels(
      {
        ids: ['c-week', 'new-9', 'c-hp', 'gone'],
        added: [{ id: 'new-9', label: 'Brunch' }],
      },
      all,
    ),
    ['Brunch', 'High-protein', 'Weeknight'],
    'alphabetical, an id nothing names is skipped',
  );

  assert.deepEqual(
    getCollectionsToSave(
      {
        ids: ['c-hp', 'gone', 'new-1'],
        added: [
          { id: 'new-1', label: 'Meal prep' },
          { id: 'new-2', label: 'Unused' },
        ],
      },
      all,
    ),
    {
      collectionIds: ['c-hp', 'new-1'],
      newCollections: [{ id: 'new-1', label: 'Meal prep' }],
    },
    'a save drops an id deleted elsewhere and writes only the new collections still picked',
  );

  assert.deepEqual(
    getCollectionChange(['c-hp', 'c-week'], ['c-hp', 'c-week']),
    { add: [], remove: [] },
    'an untouched row writes nothing, so a collection another device added stays',
  );
  assert.deepEqual(
    getCollectionChange(['c-hp', 'c-week'], ['c-week', 'new-1', 'c-brunch']),
    { add: ['new-1', 'c-brunch'], remove: ['c-hp'] },
    'a save writes only what it added and took out, in the order picked',
  );
  assert.deepEqual(
    getCollectionChange([], ['c-hp']),
    { add: ['c-hp'], remove: [] },
    'a new recipe adds every one it was given',
  );

  assert.deepEqual(
    getInitialCollectionsChoice(recipeIn('legacy', undefined), all),
    { ids: [], added: [] },
    'a recipe from before collections opens with none',
  );
  assert.deepEqual(
    getInitialCollectionsChoice({ collectionIds: ['c-week', 'gone'] }, all).ids,
    ['c-week'],
    'the form starts without an id nothing names',
  );
}

// ---- Deleting a collection: chunks of recipes, re-read inside each transaction ----
{
  assert.equal(COLLECTION_BATCH_SIZE, 200);
  const recipes = Array.from({ length: 450 }, (_, index) =>
    recipeIn(`r${index}`, ['c-hp']),
  );
  const withOthers = [
    ...recipes,
    recipeIn('elsewhere', ['c-week']),
    recipeIn('legacy', undefined),
    recipeIn('empty', []),
  ];
  const chunks = getRemovalChunks(withOthers, 'c-hp');
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [200, 200, 50],
    "450 recipes make three transactions, each under Firestore's 500 writes",
  );
  assert.equal(
    chunks.flat().length,
    450,
    'every recipe naming it is in a chunk',
  );
  assert.equal(new Set(chunks.flat()).size, 450, 'and in only one');
  assert.equal(
    chunks.flat().includes('elsewhere'),
    false,
    'a recipe in another collection is left alone',
  );
  assert.deepEqual(
    getRemovalChunks(withOthers, 'c-bulk'),
    [],
    'a collection no recipe names has nothing to take off',
  );
  assert.deepEqual(
    getRemovalChunks(recipes.slice(0, 5), 'c-hp', 2).map((c) => c.length),
    [2, 2, 1],
    'the size is a parameter',
  );

  assert.deepEqual(withoutCollection(['c-hp', 'c-week'], 'c-hp'), ['c-week']);
  assert.deepEqual(
    withoutCollection(['c-hp'], 'c-hp'),
    [],
    'the last one leaves an empty list, never a missing key',
  );
  assert.equal(
    withoutCollection(['c-week'], 'c-hp'),
    null,
    'a recipe another device already took it off is not written',
  );
  assert.equal(
    withoutCollection(undefined, 'c-hp'),
    null,
    'a legacy recipe is not written',
  );
  assert.equal(
    withoutCollection('c-hp', 'c-hp'),
    null,
    'a stored value that is not a list is not written',
  );
  const stored = ['c-hp', 'c-week'];
  withoutCollection(stored, 'c-hp');
  assert.deepEqual(
    stored,
    ['c-hp', 'c-week'],
    'the stored list is never changed in place',
  );

  // What each chunk reports adds up to the number of recipes really changed, even when a few were changed elsewhere in between.
  const reread = new Map<string, unknown>(
    withOthers.map((recipe) => [recipe.id, recipe.collectionIds]),
  );
  reread.set('r3', ['c-week']);
  reread.set('r260', undefined);
  const changed = chunks
    .map(
      (chunk) =>
        chunk.filter((id) => withoutCollection(reread.get(id), 'c-hp') !== null)
          .length,
    )
    .reduce((sum, count) => sum + count, 0);
  assert.equal(
    changed,
    448,
    'two recipes that no longer named it at re-read are not counted',
  );
}

// ---- Favorites: the star, the order and the tap guard ----
{
  assert.equal(isStarred({ isFavorite: true }), true);
  assert.equal(isStarred({ isFavorite: false }), false);
  assert.equal(
    isStarred({}),
    false,
    'a saved meal from before favorites is not starred',
  );
  assert.equal(isStarred({ isFavorite: null }), false);

  const meals = [
    { id: 'n1', isFavorite: false },
    { id: 'f1', isFavorite: true },
    { id: 'legacy' } as { id: string; isFavorite?: boolean },
    { id: 'f2', isFavorite: true },
    { id: 'n2', isFavorite: false },
  ];
  assert.deepEqual(
    sortFavoritesFirst(meals).map((meal) => meal.id),
    ['f1', 'f2', 'n1', 'legacy', 'n2'],
    'starred first, and each group keeps the order it came in',
  );
  assert.deepEqual(
    meals.map((meal) => meal.id),
    ['n1', 'f1', 'legacy', 'f2', 'n2'],
    'the list that came in is not reordered in place',
  );
  assert.deepEqual(
    sortFavoritesFirst(sortFavoritesFirst(meals)).map((meal) => meal.id),
    sortFavoritesFirst(meals).map((meal) => meal.id),
    'sorting twice changes nothing',
  );
  assert.deepEqual(sortFavoritesFirst([]), []);
  assert.deepEqual(
    sortFavoritesFirst([{ id: 'a' }, { id: 'b' }]).map((meal) => meal.id),
    ['a', 'b'],
    'with none starred the order is untouched',
  );

  assert.equal(
    shouldIgnoreStarTap(null, false),
    false,
    'nothing pending: the tap goes through',
  );
  assert.equal(
    shouldIgnoreStarTap(true, false),
    true,
    'asked for a star, not shown yet: ignored',
  );
  assert.equal(
    shouldIgnoreStarTap(true, true),
    false,
    'once the star shows, the next tap is a new choice',
  );
  assert.equal(
    shouldIgnoreStarTap(false, true),
    true,
    'asked to take it off, still shown: ignored',
  );
  assert.equal(shouldIgnoreStarTap(false, false), false);

  const picks = rankRecentPicks({
    recipes: [{ id: 'r1', title: 'Rice', createdAt: 900 }],
    meals: [
      { id: 'm-old', name: 'Old plate', createdAt: 10, isFavorite: true },
      { id: 'm-new', name: 'New plate', createdAt: 800 },
      {
        id: 'm-fav2',
        name: 'Another favorite',
        createdAt: 20,
        isFavorite: true,
      },
    ],
    plannedMeals: [],
    cookSummaries: new Map(),
  });
  assert.deepEqual(
    picks.map((pick) => pick.id),
    ['m-fav2', 'm-old', 'r1', 'm-new'],
    "starred saved meals lead the plan builder's recents, newest first among themselves, then the rest by recency",
  );
}

// ---- A collection's name finds its recipes in the search ----
{
  const recipe = (id: string, title: string, ids: string[] | undefined) =>
    ({
      id,
      title,
      description: null,
      ingredients: [],
      sourceId: null,
      ...(ids === undefined ? {} : { collectionIds: ids }),
    }) as unknown as Recipe;
  const ingredients = new Map<string, ResolvedIngredient>();
  const sources = new Map<string, Source>();
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const recipes = [
    recipe('a', 'Adobo', ['c-week']),
    recipe('b', 'Bowl', ['c-hp', 'gone']),
    recipe('legacy', 'Nachos', undefined),
  ];
  const index = buildRecipeSearchIndex(recipes, ingredients, sources, byId);
  assert.deepEqual(
    searchRecipes(index, 'weeknight').map((r) => r.id),
    ['a'],
  );
  assert.deepEqual(
    searchRecipes(index, 'protein').map((r) => r.id),
    ['b'],
    'a word that starts the name',
  );
  assert.deepEqual(
    searchRecipes(index, 'night').map((r) => r.id),
    [],
    'the middle of a word does not match',
  );
  assert.deepEqual(
    searchRecipes(index, 'gone').map((r) => r.id),
    [],
    'an id nothing names adds no words',
  );
  assert.deepEqual(
    searchRecipes(
      buildRecipeSearchIndex(recipes, ingredients, sources),
      'weeknight',
    ),
    [],
    'without the collections the search reads as it did',
  );
}

// ---- The caps the rules and the app share ----
{
  assert.ok(MAX_RECIPE_COLLECTIONS <= MAX_COLLECTIONS);
  assert.ok(MAX_COLLECTION_LABEL_LENGTH > 0);
  const rules = readFileSync(
    new URL('../../firestore.rules', import.meta.url),
    'utf8',
  );
  const ids =
    /function isCollectionIds\(value\) \{\s*return value is list && value\.size\(\) <= (\d+);/.exec(
      rules,
    );
  assert.equal(
    Number(ids?.[1]),
    MAX_RECIPE_COLLECTIONS,
    "the rules cap a recipe's collections at the same number the form does",
  );
  const label =
    /function isCollection\(data, id\) \{[\s\S]*?isShortText\(data\.label, (\d+)\)/.exec(
      rules,
    );
  assert.equal(
    Number(label?.[1]),
    MAX_COLLECTION_LABEL_LENGTH,
    "and a collection's name at the same length",
  );
  assert.match(
    rules,
    /function isMeal\(data, id\) \{\s*return data\.keys\(\)\.hasOnly\(\[[^\]]*'isFavorite'[^\]]*\]\)\s*&& data\.keys\(\)\.hasAll\(\[(?![^\]]*'isFavorite')[^\]]*\]\)/,
    'a saved meal may carry isFavorite but is not required to (older ones have none)',
  );
  assert.match(
    rules,
    /'sourceId', 'collectionIds', 'isArchived'/,
    'a recipe may carry collectionIds',
  );
  assert.doesNotMatch(
    rules,
    /hasAll\(\['id', 'title', 'servings', 'ingredients', 'steps', 'source', [^\]]*'collectionIds'/,
    'but is not required (older ones have none)',
  );
  assert.match(
    rules,
    /function isRecipe\(data, id\) \{\s*return data\.keys\(\)\.hasOnly\(\[[^\]]*'isFavorite'[^\]]*\]\)\s*&& data\.keys\(\)\.hasAll\(\[(?![^\]]*'isFavorite')[^\]]*\]\)/,
    'a recipe may carry isFavorite but is not required to (older ones have none)',
  );
  assert.match(
    rules,
    /data\.get\('isFavorite', false\) is bool/,
    'and the key is read with a default',
  );
  assert.match(
    rules,
    /function isCollection\(data, id\) \{\s*return data\.keys\(\)\.hasOnly\(\['id', 'label', 'createdAt', 'updatedAt'\]\)\s*&& data\.keys\(\)\.hasAll\(\['id', 'label', 'createdAt', 'updatedAt'\]\)/,
    'a new collection lists every key it has',
  );
}

// ---- Adding many recipes to collections at once ----
{
  assert.deepEqual(
    planAddToCollections(undefined, ['a', 'b']),
    { next: ['a', 'b'], added: ['a', 'b'], isAtCap: false },
    'a recipe written before collections gains the key with what was added',
  );
  assert.deepEqual(
    planAddToCollections(['a', 'x'], ['a']),
    { next: null, added: [], isAtCap: false },
    'a recipe already in it is not written',
  );
  assert.deepEqual(
    planAddToCollections(['x'], ['a', 'x', 'b', 'a']),
    { next: ['x', 'a', 'b'], added: ['a', 'b'], isAtCap: false },
    'what it has stays, the rest follows in the order given, once each',
  );
  const nineteen = Array.from(
    { length: MAX_RECIPE_COLLECTIONS - 1 },
    (_, i) => `c${i}`,
  );
  assert.deepEqual(
    planAddToCollections(nineteen, ['a', 'b']),
    { next: [...nineteen, 'a'], added: ['a'], isAtCap: true },
    'a recipe one short of the cap takes the first and says the other was left out for it',
  );
  const twenty = [...nineteen, 'last'];
  assert.deepEqual(
    planAddToCollections(twenty, ['a']),
    { next: null, added: [], isAtCap: true },
    'a recipe at the cap takes nothing and is counted as at the cap, not as already in it',
  );
  assert.deepEqual(
    planAddToCollections(twenty, ['last']),
    { next: null, added: [], isAtCap: false },
    'but one that is already in the collection is only already in it',
  );
  assert.deepEqual(
    planAddToCollections('not a list', ['a']),
    { next: ['a'], added: ['a'], isAtCap: false },
    'a stored value that is no list reads as none',
  );
  assert.deepEqual(
    planAddToCollections(['a'], ['b', 'c', 'd'], 2),
    { next: ['a', 'b'], added: ['b'], isAtCap: true },
    'the cap is a parameter',
  );

  assert.deepEqual(
    planRemoveFromCollections(['x', 'a', 'b', 'later'], ['a', 'b']),
    ['x', 'later'],
    'an Undo takes off only what the act added and keeps what came after',
  );
  assert.equal(
    planRemoveFromCollections(['x'], ['a']),
    null,
    'a recipe that no longer has what the act added is not written',
  );
  assert.equal(planRemoveFromCollections(undefined, ['a']), null);
  assert.deepEqual(
    planRemoveFromCollections(['a'], ['a']),
    [],
    'the last one leaves an empty list, never a missing key',
  );

  const labels = ['Bulk', 'Weeknight'];
  assert.deepEqual(
    getAddedToCollectionsText({
      labels: ['Bulk'],
      changed: 12,
      alreadyIn: 0,
      atCap: 0,
      gone: 0,
    }),
    { title: 'Added 12 recipes to Bulk', description: null },
    'a clean add says the count it wrote and nothing else',
  );
  assert.deepEqual(
    getAddedToCollectionsText({
      labels,
      changed: 1,
      alreadyIn: 0,
      atCap: 0,
      gone: 0,
    }),
    { title: 'Added 1 recipe to Bulk and Weeknight', description: null },
  );
  assert.equal(
    getAddedToCollectionsText({
      labels: ['A', 'B', 'C', 'D'],
      changed: 2,
      alreadyIn: 0,
      atCap: 0,
      gone: 0,
    }).title,
    'Added 2 recipes to A, B and 2 more',
    'more than two names are capped',
  );
  assert.equal(
    getAddedToCollectionsText({
      labels: ['Bulk'],
      changed: 9,
      alreadyIn: 3,
      atCap: 2,
      gone: 1,
    }).description,
    '3 were already in it. 2 are in 20 collections, the most a recipe can be in. 1 was deleted.',
    'what it left alone is said once, by why',
  );
  assert.equal(
    getAddedToCollectionsText({
      labels,
      changed: 1,
      alreadyIn: 1,
      atCap: 0,
      gone: 0,
    }).description,
    '1 was already in them.',
  );
  assert.equal(
    getNothingAddedText({
      labels: ['Bulk'],
      changed: 0,
      alreadyIn: 4,
      atCap: 0,
      gone: 0,
    }),
    'Nothing was added. 4 were already in it.',
    'an act that changed nothing says why in the sheet instead of a toast',
  );
  assert.equal(
    getNothingAddedText({
      labels: ['Bulk'],
      changed: 0,
      alreadyIn: 0,
      atCap: 0,
      gone: 0,
    }),
    'Nothing was added to Bulk.',
  );
  assert.deepEqual(
    [getUndoAddText(5, 5), getUndoAddText(3, 5), getUndoAddText(0, 1)],
    [
      null,
      'Took it back from 3 of 5 recipes; the rest changed since.',
      'Took it back from 0 of 1 recipe; the rest changed since.',
    ],
    'an Undo that took everything back is silent and one that could not says how many',
  );
  assert.deepEqual(
    [
      getRecipeSelectionTitle(0),
      getRecipeSelectionTitle(1),
      getRecipeSelectionTitle(30),
    ],
    ['Select recipes', '1 selected', '30 selected'],
  );
  assert.deepEqual(
    [getRecipeSelectionNote(0), getRecipeSelectionNote(2)],
    ['Tap the recipes you want to add.', null],
  );
  assert.deepEqual(
    [getAddToCollectionsLabel(1), getAddToCollectionsLabel(12)],
    ['Add 1 recipe', 'Add 12 recipes'],
  );
  assert.deepEqual(
    getChunks(Array.from({ length: 450 }, (_, i) => i)).map(
      (chunk) => chunk.length,
    ),
    [200, 200, 50],
    '450 recipes are three transactions, each well under 500 writes',
  );
  assert.deepEqual(getChunks([]), [], 'nothing ticked is no transaction');
  assert.deepEqual(getChunks([1, 2, 3], 2), [[1, 2], [3]]);
  assert.equal(
    sortFavoritesFirst([
      { id: 'a', isFavorite: false },
      { id: 'b' },
      { id: 'c', isFavorite: true },
      { id: 'd', isFavorite: true },
    ])
      .map((recipe) => recipe.id)
      .join(''),
    'cdab',
    'starred recipes lead and each group keeps the order it came in (a recipe with no key is not starred)',
  );
}

console.log('pinchOrganize: all checks passed');
