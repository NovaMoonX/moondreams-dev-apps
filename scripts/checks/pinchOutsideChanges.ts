import assert from 'node:assert/strict';

import {
  addRecipe,
  addToShoppingList,
  planMeal,
  undoPinchOutsideChange,
  updateRecipe,
  type ChangeContext,
  type ChangeData,
  type OutsideChange,
} from '../../functions/src/apps/pinch/share/changes.ts';
import type { AppActionResult } from '../../functions/src/connections/registry.ts';
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
  const query = (path: string) => {
    const self = {
      kind: 'query',
      path,
      select: () => self,
      limit: () => self,
      count: () => ({ kind: 'count', path }),
      get: async () => ({ docs: inCollection(path).map(snapshotOf) }),
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
              : { docs: inCollection(target.path).map(snapshotOf) },
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
const ctx = (now: number): ChangeContext => ({
  uid: UID,
  actor: { kind: 'outside', name: 'Gemini' },
  now,
  timeZone: 'UTC',
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

// The merge matches Pinch's own: an open line gains the amount, a ticked one restarts with just this amount.
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

console.log('check:pinch-outside passed');
