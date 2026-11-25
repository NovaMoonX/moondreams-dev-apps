import assert from 'node:assert/strict';

import {
  addRecipe,
  addToShoppingList,
  fillNutrition,
  findIngredients,
  planMeal,
  saveIdea,
  undoPinchOutsideChange,
  updateRecipe,
  type ChangeContext,
  type ChangeData,
  type OutsideChange,
} from '../../functions/src/apps/pinch/share/changes.ts';
import { CATALOG_NUTRITION_IDS } from '../../functions/src/apps/pinch/share/catalogNutrition.ts';
import { runSiteAction } from '../../functions/src/connections/liveRouter.ts';
import type { AppActionResult } from '../../functions/src/connections/registry.ts';
import { toGrantId } from '../../functions/src/vendor/connectionsContract.ts';
import {
  SOFT_MAX_IDEAS,
  SOFT_MAX_PLANNED_MEALS,
  SOFT_MAX_RECIPES,
} from '../../src/apps/pinch/constants.ts';
import { getMergedFields } from '../../src/apps/pinch/utils/shopping.ts';

type Fields = Record<string, unknown>;

/** Just enough Firestore for the change actions: documents by path, queries that read a collection, counts, and transactions that read first and write at the end. */
const createStore = (seed: Record<string, Fields> = {}) => {
  const docs = new Map(Object.entries(seed));
  const snapshotOf = (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      exists: data !== undefined,
      ref: refOf(path),
      data: () => (data ? { ...data } : undefined),
      get: (field: string) => data?.[field],
    };
  };
  const refOf = (path: string): never =>
    ({
      path,
      id: path.split('/').pop(),
      kind: 'doc',
      get: async () => snapshotOf(path),
    }) as never;
  const inCollection = (path: string) =>
    [...docs.keys()].filter(
      (key) =>
        key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'),
    );
  const query = (
    path: string,
    filters: ((data: Fields | undefined) => boolean)[] = [],
  ) => {
    const rows = () =>
      inCollection(path).filter((key) =>
        filters.every((filter) => filter(docs.get(key))),
      );
    const self = {
      kind: 'query',
      path,
      rows,
      select: () => self,
      limit: () => self,
      where: (field: string, operator: string, value: unknown) =>
        query(path, [
          ...filters,
          (data) =>
            operator === '=='
              ? data?.[field] === value
              : Array.isArray(data?.[field]) &&
                (data[field] as unknown[]).includes(value),
        ]),
      count: () => ({ kind: 'count', path }),
      get: async () => ({ docs: rows().map(snapshotOf) }),
    };
    return self;
  };
  const writes: (() => void)[] = [];
  const apply = (path: string, data: Fields | null, mode: string) => () => {
    if (data === null) docs.delete(path);
    else if (mode === 'update') {
      assert.ok(docs.has(path), `update of a missing document ${path}`);
      docs.set(path, { ...docs.get(path), ...data });
    } else {
      assert.ok(
        mode !== 'create' || !docs.has(path),
        `create over an existing document ${path}`,
      );
      docs.set(path, { ...data });
    }
  };
  const firestore = {
    doc: (path: string) => refOf(path),
    collection: (path: string) => query(path),
    runTransaction: async <T>(
      run: (transaction: unknown) => Promise<T>,
    ): Promise<T> => {
      writes.length = 0;
      const transaction = {
        get: async (target: { kind: string; path: string }) =>
          target.kind === 'doc'
            ? snapshotOf(target.path)
            : target.kind === 'count'
              ? { data: () => ({ count: inCollection(target.path).length }) }
              : {
                  docs: (target as unknown as { rows: () => string[] })
                    .rows()
                    .map(snapshotOf),
                },
        create: (target: { path: string }, data: Fields) =>
          writes.push(apply(target.path, data, 'create')),
        set: (target: { path: string }, data: Fields) =>
          writes.push(apply(target.path, data, 'set')),
        update: (target: { path: string }, data: Fields) =>
          writes.push(apply(target.path, data, 'update')),
        delete: (target: { path: string }) =>
          writes.push(apply(target.path, null, 'delete')),
      };
      const result = await run(transaction);
      writes.forEach((write) => write());
      return result;
    },
  };
  return { firestore: firestore as never, docs };
};

const UID = 'u1';
const K = `apps/pinch/kitchens/${UID}`;
const NOW = Date.UTC(2026, 10, 25, 12);
const ALL_CATEGORIES = [
  'ideas',
  'recipes',
  'recipeIngredients',
  'fullRecipes',
  'savedMeals',
  'shoppingList',
];
const ctx = (now: number, open = ALL_CATEGORIES): ChangeContext => ({
  uid: UID,
  actor: { kind: 'outside', name: 'Gemini' },
  now,
  timeZone: 'UTC',
  allowedCategories: new Set(open),
});
const dataOf = (result: AppActionResult) => {
  assert.equal(result.status, 'ok', JSON.stringify(result));
  return (result as { data: ChangeData }).data;
};
const recordOf = (store: ReturnType<typeof createStore>, id: string) =>
  store.docs.get(`${K}/outsideChanges/${id}`) as unknown as OutsideChange;

const recipe = (extra: Fields = {}): Fields => ({
  id: 'r1',
  title: 'Chicken soup',
  description: 'Cosy.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 30,
  categories: [],
  steps: ['Boil.', 'Serve.'],
  stepSections: [],
  ingredients: [],
  care: null,
  links: [],
  nutritionOverride: null,
  sourceId: null,
  isArchived: false,
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  ...extra,
});

// A new shopping line is created, and a record says nothing was merged into it.
{
  const store = createStore();
  const data = dataOf(
    await addToShoppingList(store.firestore, ctx(NOW), {
      items: [{ name: 'Chicken breast', amount: 2, unit: 'EACH' }],
    }),
  );
  assert.equal(data.changes.length, 1);
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.kind, 'shoppingAdded');
  assert.equal(record.createdItem, true);
  assert.equal(record.addedAmount, null);
  assert.deepEqual(record.by, { kind: 'assistant', name: 'Gemini' });
  assert.equal(record.undoneAt, null);
  assert.equal(
    store.docs.get(`${K}/shoppingItems/${record.shoppingItemId}`)?.amount,
    2,
  );
}

// The merge matches the client's own: an open line gains the amount, a ticked one restarts with just this amount.
const mergeCases = [
  { existing: { amount: 1.5, isChecked: false }, add: 0.333 },
  { existing: { amount: 3, isChecked: true }, add: 2 },
  { existing: { amount: null, isChecked: false }, add: 2 },
];
for (const { existing, add } of mergeCases) {
  const store = createStore({
    [`${K}/shoppingItems/cat-chicken-breast__EACH`]: {
      id: 'cat-chicken-breast__EACH',
      ingredientId: 'cat-chicken-breast',
      unit: 'EACH',
      createdAt: NOW - 5000,
      updatedAt: NOW - 5000,
      sources: [],
      pantryAddedAt: null,
      ...existing,
    },
  });
  const data = dataOf(
    await addToShoppingList(store.firestore, ctx(NOW), {
      items: [{ name: 'Chicken breast', amount: add, unit: 'EACH' }],
    }),
  );
  const item = store.docs.get(`${K}/shoppingItems/cat-chicken-breast__EACH`)!;
  const client = getMergedFields(
    existing,
    {
      ingredientId: 'cat-chicken-breast',
      unit: 'EACH',
      amount: add,
    } as never,
    NOW,
  );
  assert.equal(item.amount, client.amount, JSON.stringify(existing));
  assert.equal(item.isChecked, client.isChecked);
  assert.equal(recordOf(store, data.changes[0].id).createdItem, false);
}

// Undo subtracts only what was added, and refuses once the line moved on.
{
  const path = `${K}/shoppingItems/cat-chicken-breast__EACH`;
  const store = createStore({
    [path]: {
      id: 'cat-chicken-breast__EACH',
      ingredientId: 'cat-chicken-breast',
      unit: 'EACH',
      amount: 2,
      isChecked: false,
      createdAt: NOW - 5000,
      updatedAt: NOW - 5000,
      sources: [],
      pantryAddedAt: null,
    },
  });
  const added = dataOf(
    await addToShoppingList(store.firestore, ctx(NOW), {
      items: [{ name: 'Chicken breast', amount: 3, unit: 'EACH' }],
    }),
  );
  const changeId = added.changes[0].id;
  assert.equal(store.docs.get(path)?.amount, 5);
  assert.equal(recordOf(store, changeId).addedAmount, 3);
  // Someone shopped and ticked it: nothing is subtracted.
  store.docs.set(path, { ...store.docs.get(path), isChecked: true });
  const ticked = await undoPinchOutsideChange(
    store.firestore,
    UID,
    changeId,
    'helm',
    NOW + 1,
  );
  assert.equal(ticked.ok, false);
  assert.equal(!ticked.ok && ticked.isSettled, false);
  assert.equal(
    recordOf(store, changeId).undoneAt,
    null,
    'a refusal leaves the record open',
  );
  // The amount fell below what was added.
  store.docs.set(path, {
    ...store.docs.get(path),
    isChecked: false,
    amount: 1,
  });
  assert.equal(
    (
      await undoPinchOutsideChange(
        store.firestore,
        UID,
        changeId,
        'helm',
        NOW + 2,
      )
    ).ok,
    false,
  );
  store.docs.set(path, { ...store.docs.get(path), amount: 5 });
  assert.deepEqual(
    await undoPinchOutsideChange(
      store.firestore,
      UID,
      changeId,
      'helm',
      NOW + 3,
    ),
    { ok: true },
  );
  assert.equal(store.docs.get(path)?.amount, 2);
  assert.equal(recordOf(store, changeId).undoneBy, 'helm');
  const again = await undoPinchOutsideChange(
    store.firestore,
    UID,
    changeId,
    'pinch',
    NOW + 4,
  );
  assert.deepEqual(again, {
    ok: false,
    message: 'Already taken back in Helm.',
    isSettled: true,
  });
}

// A line the assistant restarted after it was ticked goes back to ticked.
{
  const path = `${K}/shoppingItems/cat-chicken-breast__EACH`;
  const store = createStore({
    [path]: {
      id: 'cat-chicken-breast__EACH',
      ingredientId: 'cat-chicken-breast',
      unit: 'EACH',
      amount: 4,
      isChecked: true,
      createdAt: NOW - 5000,
      updatedAt: NOW - 5000,
      sources: [],
      pantryAddedAt: null,
    },
  });
  const data = dataOf(
    await addToShoppingList(store.firestore, ctx(NOW), {
      items: [{ name: 'Chicken breast', amount: 1, unit: 'EACH' }],
    }),
  );
  assert.equal(store.docs.get(path)?.amount, 1);
  assert.equal(store.docs.get(path)?.isChecked, false);
  await undoPinchOutsideChange(
    store.firestore,
    UID,
    data.changes[0].id,
    'pinch',
    NOW + 1,
  );
  assert.equal(store.docs.get(path)?.amount, 4);
  assert.equal(store.docs.get(path)?.isChecked, true);
}

// An edit is recorded as a change in the recipe's history by the assistant, and Undo puts the recipe back and takes the entry away.
{
  const store = createStore({ [`${K}/recipes/r1`]: recipe() });
  const data = dataOf(
    await updateRecipe(store.firestore, ctx(NOW), {
      recipeId: 'r1',
      servings: 6,
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.kind, 'recipeUpdated');
  assert.ok(record.noteId);
  const note = store.docs.get(`${K}/notes/${record.noteId}`)!;
  assert.equal(note.kind, 'TWEAK');
  assert.deepEqual(note.by, { kind: 'assistant', name: 'Gemini' });
  assert.equal((note.previous as { servings: number }).servings, 4);
  assert.equal(store.docs.get(`${K}/recipes/r1`)?.servings, 6);
  assert.deepEqual(
    await undoPinchOutsideChange(
      store.firestore,
      UID,
      record.id,
      'helm',
      NOW + 10,
    ),
    { ok: true },
  );
  assert.equal(store.docs.get(`${K}/recipes/r1`)?.servings, 4);
  assert.equal(store.docs.has(`${K}/notes/${record.noteId}`), false);
}

// Once the person saved the recipe again, Undo is refused and the recipe is left as they made it.
{
  const store = createStore({ [`${K}/recipes/r1`]: recipe() });
  const data = dataOf(
    await updateRecipe(store.firestore, ctx(NOW), {
      recipeId: 'r1',
      title: 'Better soup',
    }),
  );
  const id = data.changes[0].id;
  store.docs.set(`${K}/recipes/r1`, {
    ...store.docs.get(`${K}/recipes/r1`),
    servings: 8,
    updatedAt: NOW + 500,
  });
  const refused = await undoPinchOutsideChange(
    store.firestore,
    UID,
    id,
    'helm',
    NOW + 600,
  );
  assert.equal(refused.ok, false);
  assert.equal(store.docs.get(`${K}/recipes/r1`)?.servings, 8);
  assert.equal(recordOf(store, id).undoneAt, null);
}

// No edit is a no-op: nothing is written.
{
  const store = createStore({ [`${K}/recipes/r1`]: recipe() });
  const data = dataOf(
    await updateRecipe(store.firestore, ctx(NOW), {
      recipeId: 'r1',
      servings: 4,
    }),
  );
  assert.equal(data.changes.length, 0);
  assert.equal(
    [...store.docs.keys()].some((key) => key.includes('outsideChanges')),
    false,
  );
}

// A missing or archived recipe is not found, and nothing is deleted anywhere.
{
  const store = createStore({
    [`${K}/recipes/r2`]: recipe({ id: 'r2', isArchived: true }),
  });
  for (const recipeId of ['nope', 'r2', 'a/b']) {
    assert.equal(
      (await updateRecipe(store.firestore, ctx(NOW), { recipeId, servings: 2 }))
        .status,
      'notFound',
    );
  }
}

// A new recipe is recorded; Undo archives it unless it was edited since.
{
  const store = createStore();
  const data = dataOf(
    await addRecipe(store.firestore, ctx(NOW), {
      title: 'Lemon pasta',
      steps: [{ text: 'Boil the pasta.' }],
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.kind, 'recipeAdded');
  assert.equal(data.recipeId, record.recipeId);
  const path = `${K}/recipes/${record.recipeId}`;
  assert.equal(store.docs.get(path)?.title, 'Lemon pasta');
  assert.deepEqual(
    await undoPinchOutsideChange(
      store.firestore,
      UID,
      record.id,
      'pinch',
      NOW + 1,
    ),
    { ok: true },
  );
  assert.equal(store.docs.get(path)?.isArchived, true);

  const edited = dataOf(
    await addRecipe(store.firestore, ctx(NOW + 100), { title: 'Fish pie' }),
  );
  const editedRecord = recordOf(store, edited.changes[0].id);
  const editedPath = `${K}/recipes/${editedRecord.recipeId}`;
  store.docs.set(editedPath, {
    ...store.docs.get(editedPath),
    updatedAt: NOW + 900,
  });
  assert.equal(
    (
      await undoPinchOutsideChange(
        store.firestore,
        UID,
        editedRecord.id,
        'helm',
        NOW + 1000,
      )
    ).ok,
    false,
  );
  assert.equal(store.docs.get(editedPath)?.isArchived, false);
}

// A planned meal is recorded; Undo removes it unless it changed, and a past day is refused.
{
  const store = createStore({ [`${K}/recipes/r1`]: recipe() });
  const data = dataOf(
    await planMeal(store.firestore, ctx(NOW), {
      date: '2026-11-27',
      mealType: 'dinner',
      recipeId: 'r1',
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.kind, 'mealPlanned');
  const path = `${K}/plannedMeals/${record.plannedMealId}`;
  assert.equal(store.docs.get(path)?.date, Date.UTC(2026, 10, 27));
  assert.equal(
    (
      await planMeal(store.firestore, ctx(NOW), {
        date: '2026-11-24',
        mealType: 'dinner',
        recipeId: 'r1',
      })
    ).status,
    'refused',
  );
  store.docs.set(path, { ...store.docs.get(path), updatedAt: NOW + 5 });
  assert.equal(
    (
      await undoPinchOutsideChange(
        store.firestore,
        UID,
        record.id,
        'helm',
        NOW + 6,
      )
    ).ok,
    false,
  );
  store.docs.set(path, {
    ...store.docs.get(path),
    updatedAt: record.createdAt,
  });
  assert.deepEqual(
    await undoPinchOutsideChange(
      store.firestore,
      UID,
      record.id,
      'helm',
      NOW + 7,
    ),
    { ok: true },
  );
  assert.equal(store.docs.has(path), false);
}

// An undo of a change that no longer exists says so.
{
  const store = createStore();
  assert.equal(
    (await undoPinchOutsideChange(store.firestore, UID, 'missing', 'helm', NOW))
      .ok,
    false,
  );
  assert.equal(
    (await undoPinchOutsideChange(store.firestore, UID, 'a/b', 'helm', NOW)).ok,
    false,
  );
}

const replyText = (result: AppActionResult) => {
  const { reply } = dataOf(result);
  return [reply.summary, ...reply.lines].join('\n');
};

// The assistant's reply never quotes a stored step, ingredient or title from a category that is off; the person's record still does.
{
  const seed = () =>
    createStore({
      [`${K}/recipes/r1`]: recipe({
        steps: ['Boil the secret broth.', 'Serve.'],
        ingredients: [
          {
            id: 'l1',
            ingredientId: null,
            freeText: 'Saffron threads',
            amount: 1,
            unit: 'EACH',
            note: null,
            group: null,
            adaptedFrom: null,
          },
        ],
      }),
    });
  const edit = {
    recipeId: 'r1',
    basedOn: NOW - 1000,
    title: 'Renamed soup',
    servings: 8,
    ingredients: [{ name: 'Paprika', amount: 2 }],
    steps: [{ text: 'Serve.' }],
  };
  const off = seed();
  const offResult = await updateRecipe(off.firestore, ctx(NOW, []), edit);
  const offText = replyText(offResult);
  for (const hidden of [
    'secret broth',
    'Saffron',
    'Chicken soup',
    'Serves 4',
    '→',
  ]) {
    assert.ok(!offText.includes(hidden), `${hidden} leaked: ${offText}`);
  }
  assert.match(offText, /Serves 8/);
  assert.match(offText, /Steps replaced \(1 step\)/);
  assert.match(offText, /Ingredients replaced \(1\)/);
  const stored = dataOf(offResult).lines.join('\n');
  assert.match(stored, /Removed step 1: “Boil the secret broth\.”/);
  assert.match(stored, /Saffron threads/);

  const stepsOn = seed();
  const stepsText = replyText(
    await updateRecipe(stepsOn.firestore, ctx(NOW, ['fullRecipes']), edit),
  );
  assert.match(stepsText, /secret broth/);
  assert.ok(!stepsText.includes('Saffron'), stepsText);
  const ingredientsOn = seed();
  const ingredientsText = replyText(
    await updateRecipe(
      ingredientsOn.firestore,
      ctx(NOW, ['recipeIngredients']),
      edit,
    ),
  );
  assert.match(ingredientsText, /Saffron/);
  assert.ok(!ingredientsText.includes('secret broth'), ingredientsText);
  const recipesOn = seed();
  const titleText = replyText(
    await updateRecipe(recipesOn.firestore, ctx(NOW, ['recipes']), edit),
  );
  assert.match(titleText, /Serves 4 → 8/);

  const describe = (open: string[]) =>
    updateRecipe(seed().firestore, ctx(NOW, open), {
      recipeId: 'r1',
      description: 'Brand new words.',
    }).then(replyText);
  const recipesOnly = await describe(['recipes']);
  assert.match(recipesOnly, /Description changed/);
  assert.ok(!recipesOnly.includes('Cosy'), recipesOnly);
  assert.match(await describe(['recipes', 'fullRecipes']), /“Cosy\.”/);
}

// A whole-list replace carries the version it read: it is required, and a recipe saved since refuses without writing.
{
  const store = createStore({ [`${K}/recipes/r1`]: recipe() });
  const noVersion = await updateRecipe(store.firestore, ctx(NOW), {
    recipeId: 'r1',
    steps: [{ text: 'Serve.' }],
  });
  assert.equal(noVersion.status, 'refused');
  assert.match((noVersion as { message: string }).message, /basedOn/);
  const stale = await updateRecipe(store.firestore, ctx(NOW), {
    recipeId: 'r1',
    basedOn: NOW - 2000,
    steps: [{ text: 'Serve.' }],
  });
  assert.equal(stale.status, 'refused');
  assert.match(
    (stale as { message: string }).message,
    /changed in Pinch since you read it.*pinch_get_recipe/,
  );
  assert.deepEqual(store.docs.get(`${K}/recipes/r1`)?.steps, [
    'Boil.',
    'Serve.',
  ]);
  assert.equal(
    [...store.docs.keys()].some((key) => key.includes('outsideChanges')),
    false,
  );
  assert.equal(
    (
      await updateRecipe(store.firestore, ctx(NOW), {
        recipeId: 'r1',
        servings: 5,
      })
    ).status,
    'ok',
    'a field edit needs no version',
  );
  for (const basedOn of [NOW + 5000, NOW - 999]) {
    const future = await updateRecipe(store.firestore, ctx(NOW), {
      recipeId: 'r1',
      basedOn,
      steps: [{ text: 'Serve.' }],
    });
    assert.equal(future.status, 'refused', `basedOn ${basedOn} must refuse`);
  }
  const legacy = createStore({
    [`${K}/recipes/r1`]: Object.fromEntries(
      Object.entries(recipe()).filter(([key]) => key !== 'updatedAt'),
    ),
  });
  const guess = await updateRecipe(legacy.firestore, ctx(NOW), {
    recipeId: 'r1',
    basedOn: NOW,
    steps: [{ text: 'Serve.' }],
  });
  assert.equal(guess.status, 'refused', 'no stored version means version 0');
  assert.equal(
    (
      await updateRecipe(legacy.firestore, ctx(NOW), {
        recipeId: 'r1',
        basedOn: 0,
        steps: [{ text: 'Serve.' }],
      })
    ).status,
    'ok',
  );
  const fresh = createStore({ [`${K}/recipes/r1`]: recipe() });
  assert.equal(
    (
      await updateRecipe(fresh.firestore, ctx(NOW), {
        recipeId: 'r1',
        basedOn: NOW - 1000,
        steps: [{ text: 'Serve.' }],
      })
    ).status,
    'ok',
  );
}

// The shopping reply and the meal plan reveal nothing from a switched-off category.
{
  const path = `${K}/shoppingItems/cat-chicken-breast__EACH`;
  const store = createStore({
    [path]: {
      id: 'cat-chicken-breast__EACH',
      ingredientId: 'cat-chicken-breast',
      unit: 'EACH',
      amount: 2,
      isChecked: false,
      createdAt: NOW - 5000,
      updatedAt: NOW - 5000,
      sources: [],
      pantryAddedAt: null,
    },
  });
  const items = {
    items: [
      { name: 'Chicken breast', amount: 1, unit: 'EACH' },
      { name: 'Chicken breast', amount: 1, unit: 'EACH' },
    ],
  };
  const hidden = replyText(
    await addToShoppingList(store.firestore, ctx(NOW, []), items),
  );
  assert.ok(!/already|Chicken|merged/i.test(hidden), hidden);
  assert.match(hidden, /Added 1 item to the shopping list/);
  assert.match(
    replyText(await addToShoppingList(store.firestore, ctx(NOW), items)),
    /already on what was already on the list|Chicken/,
  );

  const meals = createStore({
    [`${K}/recipes/r1`]: recipe({ title: 'Secret stew' }),
    [`${K}/meals/m1`]: {
      name: 'Taco night',
      items: [{ kind: 'RECIPE', refId: 'r1', servings: 2 }],
    },
  });
  const plan = (open: string[], extra: Fields) =>
    planMeal(meals.firestore, ctx(NOW, open), {
      date: '2026-11-27',
      mealType: 'dinner',
      ...extra,
    });
  const byName = await plan([], { name: 'Secret stew' });
  assert.equal(byName.status, 'refused');
  assert.match(
    (byName as { message: string }).message,
    /"Read your apps".*Helm > Settings > Connected assistants/,
  );
  assert.ok(!JSON.stringify(byName).includes('Taco'), JSON.stringify(byName));
  const byId = replyText(await plan([], { recipeId: 'r1' }));
  assert.ok(!byId.includes('Secret stew'), byId);
  assert.equal(
    (await plan(['savedMeals'], { name: 'Secret stew' })).status,
    'refused',
    'a recipe is not matched while recipes are off',
  );
  assert.match(
    replyText(await plan(['recipes'], { name: 'Secret stew' })),
    /Secret stew/,
  );
  assert.match(
    replyText(await plan(['savedMeals'], { name: 'Taco night' })),
    /Taco night/,
  );
  const gone = await plan([], { recipeId: 'nope' });
  assert.equal(gone.status, 'refused');
  assert.ok(!JSON.stringify(gone).includes('Secret'), JSON.stringify(gone));
}

// Adding a recipe or planning a meal stops at the cap with a sentence and writes nothing.
{
  const full = (collection: string, count: number) =>
    createStore(
      Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
          `${K}/${collection}/x${index}`,
          { id: `x${index}` },
        ]),
      ),
    );
  const recipes = full('recipes', SOFT_MAX_RECIPES);
  const added = await addRecipe(recipes.firestore, ctx(NOW), {
    title: 'One more',
  });
  assert.equal(added.status, 'refused');
  assert.equal(recipes.docs.size, SOFT_MAX_RECIPES);
  const planned = full('plannedMeals', SOFT_MAX_PLANNED_MEALS);
  planned.docs.set(`${K}/recipes/r1`, recipe());
  const refusal = await planMeal(planned.firestore, ctx(NOW), {
    date: '2026-11-27',
    mealType: 'dinner',
    recipeId: 'r1',
  });
  assert.equal(refusal.status, 'refused');
  assert.equal(planned.docs.size, SOFT_MAX_PLANNED_MEALS + 1);
}

const customIngredient = (id: string, name: string, extra: Fields = {}) => ({
  [`${K}/ingredients/${id}`]: {
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
    isArchived: false,
    addedBy: null,
    nutritionBy: null,
    createdAt: NOW - 9000,
    updatedAt: NOW - 9000,
    ...extra,
  },
});
const ASSISTANT = { kind: 'assistant', name: 'Gemini' };
const undo = (
  store: ReturnType<typeof createStore>,
  id: string,
  now = NOW + 50,
) => undoPinchOutsideChange(store.firestore, UID, id, 'helm', now);

// Each new switch is its own: with it off (or its category off) the router answers switchedOff and runs nothing.
{
  const grant = `connections/${UID}/grants/${toGrantId('helm', 'app:pinch' as never, 'site')}`;
  const store = createStore({
    [grant]: {
      status: 'live',
      categories: { recipes: { isOn: true, changedAt: NOW } },
      changes: { editRecipes: { isOn: true, changedAt: NOW } },
    },
  });
  for (const [actionId, label] of [
    ['save_idea', 'Save recipe ideas'],
    ['fill_nutrition', 'Fill in missing nutrition'],
    ['find_ingredients', 'Recipe ingredients'],
  ]) {
    const result = await runSiteAction(store.firestore, {
      uid: UID,
      readerAppId: 'helm',
      connectorId: 'app:pinch',
      actionId,
      input: { title: 'x', items: [], names: ['x'] },
      actor: { kind: 'outside', name: 'Gemini' },
      timeZone: 'UTC',
    });
    assert.equal(result.status, 'switchedOff', actionId);
    assert.equal(
      (result as { needs: { label: string }[] }).needs[0].label,
      label,
    );
  }
  assert.equal(store.docs.size, 1, 'nothing was written');
}

// Saving an idea: a link makes a link idea, no link a written one, by the assistant, with nothing else filled.
{
  const store = createStore();
  const data = dataOf(
    await saveIdea(store.firestore, ctx(NOW), {
      title: 'Lentil soup',
      url: 'https://www.example.com/lentil-soup?utm_source=mail',
      note: 'Smoky.\nSecond line',
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.kind, 'ideaSaved');
  assert.deepEqual(record.lines, ['From example.com', 'Smoky.']);
  const idea = store.docs.get(`${K}/ideas/${record.ideaId}`)!;
  assert.equal(idea.kind, 'LINK');
  assert.equal(idea.siteName, 'example.com');
  assert.deepEqual(idea.by, ASSISTANT);
  assert.deepEqual(
    [idea.imageUrl, idea.photoPath, idea.recipeId],
    [null, null, null],
  );
  assert.equal(idea.updatedAt, NOW);
  assert.match(data.reply.summary, /Lentil soup/);

  const written = dataOf(
    await saveIdea(store.firestore, ctx(NOW), { title: 'Something with figs' }),
  );
  const writtenIdea = store.docs.get(
    `${K}/ideas/${recordOf(store, written.changes[0].id).ideaId}`,
  )!;
  assert.equal(writtenIdea.kind, 'TEXT');
  assert.equal(writtenIdea.url, null);
  assert.equal(writtenIdea.siteName, null);

  // The same page (tracking and www dropped) or the same title in another case is refused; the refusal quotes a stored title only with ideas open.
  const messageOf = (result: AppActionResult) => {
    assert.equal(result.status, 'refused', JSON.stringify(result));
    return (result as { message: string }).message;
  };
  const sameLink = {
    title: 'Another name',
    url: 'http://example.com/lentil-soup/',
  };
  assert.match(
    messageOf(await saveIdea(store.firestore, ctx(NOW), sameLink)),
    /“Lentil soup”/,
  );
  assert.ok(
    !messageOf(
      await saveIdea(store.firestore, ctx(NOW, ['recipes']), sameLink),
    ).includes('Lentil'),
  );
  const sameTitle = { title: 'lentil SOUP' };
  assert.match(
    messageOf(await saveIdea(store.firestore, ctx(NOW), sameTitle)),
    /“Lentil soup”/,
  );
  assert.ok(
    !messageOf(
      await saveIdea(store.firestore, ctx(NOW, ['recipes']), sameTitle),
    ).includes('Lentil soup'),
  );
  for (const url of [
    'javascript:alert(1)',
    'ftp://example.com/x',
    'example.com',
    'not a link',
  ]) {
    assert.match(
      messageOf(
        await saveIdea(store.firestore, ctx(NOW), { title: 'Bad link', url }),
      ),
      /http:\/\/ or https:\/\//,
      url,
    );
  }
  assert.equal(
    [...store.docs.keys()].filter((key) => key.includes('/ideas/')).length,
    2,
    'a refusal writes nothing',
  );

  // Undo deletes the idea while it is untouched, and says why when it is not.
  assert.deepEqual(await undo(store, record.id), { ok: true });
  assert.equal(store.docs.has(`${K}/ideas/${record.ideaId}`), false);
  assert.equal(recordOf(store, record.id).undoneBy, 'helm');

  const second = recordOf(store, written.changes[0].id);
  const ideaPath = `${K}/ideas/${second.ideaId}`;
  store.docs.set(ideaPath, { ...store.docs.get(ideaPath), updatedAt: NOW + 5 });
  assert.deepEqual(await undo(store, second.id), {
    ok: false,
    message: 'The idea was changed since.',
    isSettled: false,
  });
  store.docs.set(ideaPath, {
    ...store.docs.get(ideaPath),
    updatedAt: NOW,
    recipeId: 'r9',
  });
  assert.deepEqual(await undo(store, second.id), {
    ok: false,
    message: 'The idea was made into a recipe.',
    isSettled: false,
  });
  assert.equal(store.docs.has(ideaPath), true);
}

// The ideas list stops at its cap with a sentence.
{
  const store = createStore(
    Object.fromEntries(
      Array.from({ length: SOFT_MAX_IDEAS }, (_, index) => [
        `${K}/ideas/i${index}`,
        { id: `i${index}`, title: `Idea ${index}`, url: null },
      ]),
    ),
  );
  const result = await saveIdea(store.firestore, ctx(NOW), {
    title: 'One more',
  });
  assert.equal(result.status, 'refused');
  assert.equal(store.docs.size, SOFT_MAX_IDEAS);
}

const line = (name: string, extra: Fields = {}) => ({
  name,
  amount: 1,
  unit: 'lb',
  ...extra,
});

// A line the kitchen knows by its plain name uses it, with the dropped words in the note; a word of the ingredient's own name is never dropped.
{
  const seed = () =>
    createStore({
      ...customIngredient('ing-gb', 'Ground beef'),
      ...customIngredient('ing-peas', 'Frozen peas'),
      ...customIngredient('ing-bread', 'Bread'),
      ...customIngredient('ing-beef', 'Beef'),
    });
  const store = seed();
  const data = dataOf(
    await addRecipe(store.firestore, ctx(NOW), {
      title: 'Chili',
      ingredients: [
        line('Lean ground beef'),
        line('93% lean ground beef', { note: 'browned' }),
        line('Frozen peas'),
        line('ground beef', { note: 'lean' }),
        line('Sliced bread'),
        line('Minced beef'),
      ],
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  const lines = store.docs.get(`${K}/recipes/${record.recipeId}`)!
    .ingredients as { ingredientId: string | null; note: string | null }[];
  assert.deepEqual(
    lines.map(({ ingredientId, note }) => [ingredientId, note]),
    [
      ['ing-gb', 'lean'],
      ['ing-gb', '93% lean, browned'],
      ['ing-peas', null],
      ['ing-gb', 'lean'],
      ['ing-bread', 'sliced'],
      [null, null],
    ],
  );
  const text = replyText(
    await addRecipe(seed().firestore, ctx(NOW), {
      title: 'Chili',
      ingredients: [line('Lean ground beef')],
    }),
  );
  assert.match(
    text,
    /Used your Ground beef for 'Lean ground beef', lean in the note/,
  );
  const closed = replyText(
    await addRecipe(seed().firestore, ctx(NOW, []), {
      title: 'Chili',
      ingredients: [line('Lean ground beef')],
    }),
  );
  assert.ok(
    !closed.includes('Ground beef') && !closed.includes('Used your'),
    closed,
  );
}

// A new ingredient is made only when the line says it is one, two lines with one new name share it, and Undo archives it unless it is used or was changed.
{
  const newLines = [
    line('dragon fruit', { isNewIngredient: true }),
    line('Dragon fruit', { isNewIngredient: true, note: 'ripe', amount: 2 }),
    line('reserved pasta water'),
    line('kumquat jam', { isNewIngredient: false }),
  ];
  const add = async (store = createStore()) => {
    const data = dataOf(
      await addRecipe(store.firestore, ctx(NOW), {
        title: 'Fruit bowl',
        ingredients: newLines,
      }),
    );
    return { store, data, record: recordOf(store, data.changes[0].id) };
  };
  const { store, data, record } = await add();
  const ingredientDocs = [...store.docs.entries()].filter(([key]) =>
    key.includes('/ingredients/'),
  );
  assert.equal(ingredientDocs.length, 1);
  const [[, made]] = ingredientDocs;
  assert.equal(made.name, 'Dragon fruit');
  assert.deepEqual(made.addedBy, ASSISTANT);
  assert.equal(made.nutritionBy, null);
  assert.equal(made.nutritionPer100g, null);
  assert.equal(made.isArchived, false);
  assert.deepEqual(record.createdIngredientIds, [made.id]);
  const lines = store.docs.get(`${K}/recipes/${record.recipeId}`)!
    .ingredients as { ingredientId: string | null; freeText: string | null }[];
  assert.deepEqual(
    lines.map((entry) => [entry.ingredientId, entry.freeText]),
    [
      [made.id, null],
      [made.id, null],
      [null, 'reserved pasta water'],
      [null, 'kumquat jam'],
    ],
  );
  assert.match(
    data.reply.lines.join('\n'),
    /Added 1 new ingredient: Dragon fruit/,
  );
  assert.ok(record.lines.some((entry) => /Added 1 new ingredient/.test(entry)));

  assert.deepEqual(await undo(store, record.id), { ok: true });
  const archived = store.docs.get(`${K}/ingredients/${made.id}`)!;
  assert.equal(archived.isArchived, true);
  assert.equal(archived.updatedAt, NOW + 50);
  assert.equal(
    store.docs.get(`${K}/recipes/${record.recipeId}`)?.isArchived,
    true,
  );

  // Something else uses it: a shopping item, another recipe's line, a planned meal, a package or a saved meal.
  const users: Record<string, (id: string) => Record<string, Fields>> = {
    shopping: (id) => ({ [`${K}/shoppingItems/s1`]: { ingredientId: id } }),
    recipe: (id) => ({
      [`${K}/recipes/other`]: recipe({
        id: 'other',
        ingredients: [{ id: 'l9', ingredientId: id, freeText: null }],
      }),
    }),
    planned: (id) => ({ [`${K}/plannedMeals/p1`]: { refIds: [id] } }),
    stock: (id) => ({ [`${K}/packages/k1`]: { ingredientId: id } }),
    saved: (id) => ({
      [`${K}/meals/m1`]: { items: [{ kind: 'INGREDIENT', refId: id }] },
    }),
  };
  for (const [name, seedFor] of Object.entries(users)) {
    const used = await add();
    const id = used.record.createdIngredientIds![0];
    Object.entries(seedFor(id)).forEach(([key, value]) =>
      used.store.docs.set(key, value),
    );
    assert.deepEqual(
      await undo(used.store, used.record.id),
      { ok: true },
      name,
    );
    assert.equal(
      used.store.docs.get(`${K}/ingredients/${id}`)?.isArchived,
      false,
      `${name} keeps it`,
    );
    assert.equal(
      used.store.docs.get(`${K}/recipes/${used.record.recipeId}`)?.isArchived,
      true,
    );
  }

  // The person changed it since.
  const changed = await add();
  const changedId = changed.record.createdIngredientIds![0];
  changed.store.docs.set(`${K}/ingredients/${changedId}`, {
    ...changed.store.docs.get(`${K}/ingredients/${changedId}`),
    name: 'Pitaya',
    updatedAt: NOW + 7,
  });
  assert.deepEqual(await undo(changed.store, changed.record.id), { ok: true });
  assert.equal(
    changed.store.docs.get(`${K}/ingredients/${changedId}`)?.isArchived,
    false,
  );
}

// Editing a recipe makes the same new ingredient and its Undo takes it back with the edit.
{
  const store = createStore({ [`${K}/recipes/r1`]: recipe() });
  const data = dataOf(
    await updateRecipe(store.firestore, ctx(NOW), {
      recipeId: 'r1',
      basedOn: NOW - 1000,
      ingredients: [line('Dragon fruit', { isNewIngredient: true })],
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.createdIngredientIds?.length, 1);
  const id = record.createdIngredientIds![0];
  assert.match(data.lines.join('\n'), /Dragon fruit/);
  assert.deepEqual(await undo(store, record.id), { ok: true });
  assert.equal(store.docs.get(`${K}/ingredients/${id}`)?.isArchived, true);
  assert.deepEqual(store.docs.get(`${K}/recipes/r1`)?.ingredients, []);
}

// A shopping add that made an ingredient keeps its id, and its Undo archives the ingredient with the item.
{
  const store = createStore();
  const data = dataOf(
    await addToShoppingList(store.firestore, ctx(NOW), {
      items: [{ name: 'Dragon fruit', amount: 2 }],
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  const id = record.createdIngredientIds![0];
  assert.deepEqual(
    store.docs.get(`${K}/ingredients/${id}`)?.addedBy,
    ASSISTANT,
  );
  assert.deepEqual(await undo(store, record.id), { ok: true });
  assert.equal(
    store.docs.has(`${K}/shoppingItems/${record.shoppingItemId}`),
    false,
  );
  assert.equal(store.docs.get(`${K}/ingredients/${id}`)?.isArchived, true);
}

// find_ingredients answers with the kitchen's own names, the words for the note, whether nutrition is there, and near names.
{
  const store = createStore({
    ...customIngredient('ing-gb', 'Ground beef'),
    ...customIngredient('ing-df', 'Dragon fruit', {
      nutritionPer100g: { calories: 60, protein: null, carbs: null, fat: null },
    }),
    [`${K}/ingredients/cat-egg`]: {
      id: 'cat-egg',
      catalogId: 'cat-egg',
      name: null,
      nutritionPer100g: null,
      isArchived: false,
    },
    ...customIngredient('ing-old', 'Old thing', { isArchived: true }),
  });
  const found = await findIngredients(store.firestore, UID, {
    names: [
      'lean ground beef',
      'dragon fruit',
      'chicken breast',
      'egg',
      'turkey sausage',
      'old thing',
      'zzz',
    ],
  });
  assert.equal(found.kind, 'ok');
  const results = found.kind === 'ok' ? found.value : [];
  assert.deepEqual(results[0], {
    asked: 'lean ground beef',
    match: { name: 'Ground beef', hasNutrition: false },
    noteWords: ['lean'],
    close: [],
  });
  assert.deepEqual(results[1].match, {
    name: 'Dragon fruit',
    hasNutrition: true,
  });
  assert.deepEqual(results[2].match, {
    name: 'Chicken breast',
    hasNutrition: true,
  });
  assert.deepEqual(results[3].match, { name: 'Egg', hasNutrition: true });
  assert.equal(results[4].match, null);
  assert.ok(results[4].close.length >= 1 && results[4].close.length <= 3);
  assert.ok(results[4].close.every((name) => /turkey|sausage/i.test(name)));
  assert.equal(results[5].match, null, 'an archived ingredient is not offered');
  assert.deepEqual(results[6], {
    asked: 'zzz',
    match: null,
    noteWords: [],
    close: [],
  });
  assert.equal(
    (await findIngredients(store.firestore, UID, { names: [] })).kind,
    'refused',
  );
}

// fill_nutrition fills only what has none, says what it skipped, and Undo is all or nothing.
{
  const seed = () =>
    createStore({
      ...customIngredient('ing-df', 'Dragon fruit'),
      ...customIngredient('ing-oat', 'Oat milk', {
        nutritionPer100g: { calories: 40, protein: 1, carbs: 7, fat: 1 },
      }),
      ...customIngredient('ing-old', 'Old thing', { isArchived: true }),
    });
  const values = { calories: 60, protein: 1.2, carbs: 13, fat: null };
  const store = seed();
  const data = dataOf(
    await fillNutrition(store.firestore, ctx(NOW), {
      items: [
        { ingredient: 'dragon fruit', per100g: values },
        { ingredient: 'oat milk', per100g: values },
        { ingredient: 'old thing', per100g: values },
        { ingredient: 'unobtainium', per100g: values },
        { ingredient: 'egg', per100g: values },
      ],
    }),
  );
  const record = recordOf(store, data.changes[0].id);
  assert.equal(record.kind, 'nutritionFilled');
  assert.equal(record.title, 'Dragon fruit');
  assert.deepEqual(record.lines, [
    'Dragon fruit: 60 kcal, 1.2 g protein, 13 g carbs per 100 g',
  ]);
  assert.deepEqual(record.filledNutrition, [
    { ingredientId: 'ing-df', createdRecord: false },
  ]);
  const filled = store.docs.get(`${K}/ingredients/ing-df`)!;
  assert.deepEqual(filled.nutritionPer100g, values);
  assert.deepEqual(filled.nutritionBy, ASSISTANT);
  assert.equal(filled.updatedAt, NOW);
  assert.equal(
    (
      store.docs.get(`${K}/ingredients/ing-oat`)?.nutritionPer100g as {
        calories: number;
      }
    ).calories,
    40,
  );
  const said = data.reply.lines.join('\n');
  assert.match(
    said,
    /oat milk already has nutrition; only the person can change it\./,
  );
  assert.match(said, /old thing is archived/);
  assert.match(said, /unobtainium isn't in the kitchen/);
  assert.match(said, /egg already has nutrition/);

  // A batch where every item is refused changes nothing.
  const none = await fillNutrition(store.firestore, ctx(NOW), {
    items: [{ ingredient: 'oat milk', per100g: values }],
  });
  assert.equal(none.status, 'refused');
  assert.match((none as { message: string }).message, /already has nutrition/);
  for (const per100g of [
    { calories: 901, protein: null, carbs: null, fat: null },
    { calories: null, protein: 101, carbs: null, fat: null },
    { calories: -1, protein: null, carbs: null, fat: null },
    { calories: null, protein: null, carbs: null, fat: null },
  ]) {
    assert.equal(
      (
        await fillNutrition(seed().firestore, ctx(NOW), {
          items: [{ ingredient: 'dragon fruit', per100g }],
        })
      ).status,
      'refused',
      JSON.stringify(per100g),
    );
  }

  assert.deepEqual(await undo(store, record.id), { ok: true });
  const reset = store.docs.get(`${K}/ingredients/ing-df`)!;
  assert.equal(reset.nutritionPer100g, null);
  assert.equal(reset.nutritionBy, null);

  // Undo refuses, naming the ingredient, once the person edited it.
  const again = seed();
  const second = dataOf(
    await fillNutrition(again.firestore, ctx(NOW), {
      items: [{ ingredient: 'dragon fruit', per100g: values }],
    }),
  );
  again.docs.set(`${K}/ingredients/ing-df`, {
    ...again.docs.get(`${K}/ingredients/ing-df`),
    nutritionBy: null,
    updatedAt: NOW + 9,
  });
  const refusal = await undo(again, second.changes[0].id);
  assert.equal(refusal.ok, false);
  assert.match(
    !refusal.ok ? refusal.message : '',
    /Dragon fruit was changed since/,
  );
  assert.equal(!refusal.ok && refusal.isSettled, false);
  assert.equal(
    (again.docs.get(`${K}/ingredients/ing-df`)?.nutritionPer100g as object) !==
      null,
    true,
  );
}

// A catalog ingredient with no nutrition gets a record of the person's own; Undo clears the nutrition and keeps the record.
{
  const store = createStore();
  const withNutrition = CATALOG_NUTRITION_IDS as Set<string>;
  withNutrition.delete('cat-egg');
  try {
    const data = dataOf(
      await fillNutrition(store.firestore, ctx(NOW), {
        items: [
          {
            ingredient: 'Egg',
            per100g: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
          },
        ],
      }),
    );
    const record = recordOf(store, data.changes[0].id);
    assert.deepEqual(record.filledNutrition, [
      { ingredientId: 'cat-egg', createdRecord: true },
    ]);
    const made = store.docs.get(`${K}/ingredients/cat-egg`)!;
    assert.equal(made.catalogId, 'cat-egg');
    assert.equal(made.name, null);
    assert.equal(made.isArchived, false);
    assert.deepEqual(made.nutritionBy, ASSISTANT);
    assert.deepEqual(await undo(store, record.id), { ok: true });
    assert.equal(
      store.docs.get(`${K}/ingredients/cat-egg`)?.nutritionPer100g,
      null,
    );
  } finally {
    withNutrition.add('cat-egg');
  }
}

// A change already gone is settled by whoever took it back.
{
  const store = createStore({
    [`${K}/outsideChanges/c1`]: {
      id: 'c1',
      kind: 'recipeUpdated',
      recipeId: 'r1',
      noteId: 'gone',
      undoneAt: null,
      undoneBy: null,
      createdAt: NOW,
    },
  });
  const settled = await undoPinchOutsideChange(
    store.firestore,
    UID,
    'c1',
    'helm',
    NOW + 1,
  );
  assert.equal(!settled.ok && settled.isSettled, true);
  assert.equal(recordOf(store, 'c1').undoneBy, 'helm');
}

console.log('check:pinch-outside passed');
