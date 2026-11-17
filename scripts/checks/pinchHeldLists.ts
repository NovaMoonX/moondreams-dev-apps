import assert from 'node:assert/strict';

import { buildPinchHolds } from '../../src/apps/pinch/utils/heldHolds.ts';
import {
  dropPinchWrites,
  holdPinchWrites,
  settlePinchWrites,
} from '../../src/apps/pinch/store/heldLists.ts';
import {
  containersReducer,
  setContainers,
  setContainersLoadError,
} from '../../src/apps/pinch/store/slices/containersSlice.ts';
import {
  plannedMealsReducer,
  setPlannedMeals,
} from '../../src/apps/pinch/store/slices/plannedMealsSlice.ts';
import {
  setShopping,
  shoppingReducer,
} from '../../src/apps/pinch/store/slices/shoppingSlice.ts';
import { getMonthWindow } from '../../src/apps/pinch/utils/dayKeys.ts';
import type {
  Container,
  PlannedMeal,
  ShoppingItem,
} from '../../src/apps/pinch/types.ts';

const kitchen = (collection: string, id: string) => [
  'apps',
  'pinch',
  'kitchens',
  'u1',
  collection,
  id,
];

const built = buildPinchHolds(
  [
    {
      segments: kitchen('shoppingItems', 'milk__EACH'),
      before: { id: 'milk__EACH', checked: false, updatedAt: 1, amount: 1 },
      after: { id: 'milk__EACH', checked: true, updatedAt: 2, amount: 1 },
    },
    {
      segments: kitchen('containers', 'box'),
      before: { id: 'box', status: 'IN_STOCK' },
      after: null,
    },
    {
      segments: kitchen('cooks', 'never'),
      before: null,
      after: null,
    },
    {
      segments: ['apps', 'pinch', 'kitchens', 'u1'],
      before: null,
      after: { uid: 'u1' },
    },
    {
      segments: kitchen('families', 'f'),
      before: null,
      after: { id: 'f' },
    },
    {
      segments: ['apps', 'pinch', 'kitchens', 'someone', 'recipes', 'r'],
      before: null,
      after: { id: 'r' },
    },
  ],
  'u1',
  't',
);
assert.deepEqual(
  built?.shoppingItems?.map((hold) => hold.fields),
  [['checked', 'updatedAt']],
  'a tick holds only the fields it changed',
);
assert.equal(built?.containers?.[0].item, null, 'a deleted box is a removal');
assert.deepEqual(
  Object.keys(built ?? {}).sort(),
  ['containers', 'shoppingItems'],
  'the kitchen document, a collection no list holds, someone else’s kitchen and a never-made record hold nothing',
);
assert.equal(
  buildPinchHolds(
    [
      { segments: kitchen('recipes', 'r'), isUnknown: true },
      {
        segments: kitchen('shoppingItems', 'a'),
        before: null,
        after: { id: 'a' },
      },
    ],
    'u1',
    't',
  ),
  null,
  'one record that can’t be worked out holds none of the transaction',
);
assert.deepEqual(
  buildPinchHolds(
    [
      {
        segments: kitchen('recipes', 'r'),
        before: { id: 'r', title: 'Soup' },
        after: { id: 'r', title: 'Soup' },
      },
    ],
    'u1',
    't',
  ),
  {},
  'a write that changes nothing holds nothing',
);

const box = { id: 'box', status: 'IN_STOCK', servings: 2 } as Container;
const finished = { ...box, status: 'DONE', servings: 0 } as Container;
const holdBox = holdPinchWrites({
  token: 't',
  writes: {
    containers: [
      {
        id: 'box',
        item: finished,
        fingerprint: JSON.stringify({ servings: 0, status: 'DONE' }),
        token: 't',
        settledAt: null,
        fields: ['servings', 'status'],
      },
    ],
  },
});
const delivered = containersReducer(undefined, setContainers([box]));
const eaten = containersReducer(delivered, holdBox);
assert.deepEqual(
  eaten.items,
  [],
  'eating the last portion leaves the fridge at once',
);
const stale = containersReducer(eaten, setContainers([box]));
assert.deepEqual(
  stale.items,
  [],
  'a delivery that still has the box never brings it back',
);
const landed = containersReducer(stale, setContainers([]));
assert.deepEqual(
  landed.hold.held,
  [],
  'and the hold lets go once the list drops it',
);
assert.deepEqual(
  containersReducer(eaten, dropPinchWrites('t')).items,
  [box],
  'a failed write puts the box back',
);
const failed = containersReducer(eaten, setContainersLoadError('no'));
assert.deepEqual(failed.hold.held, [], 'a failed list keeps no hold');
assert.deepEqual(
  containersReducer(failed, holdBox).hold.held,
  [],
  'and takes none while it is failed',
);

const milk = {
  id: 'milk',
  checked: false,
  updatedAt: 1,
} as unknown as ShoppingItem;
const toHold = (id: string, token: string) =>
  holdPinchWrites({
    token,
    writes: {
      shoppingItems: [
        {
          id,
          item: { ...milk, id },
          fingerprint: JSON.stringify({ id }),
          token,
          settledAt: null,
          fields: ['id'],
        },
      ],
    },
  });
const loading = shoppingReducer(undefined, toHold('milk', 't'));
assert.deepEqual(
  loading.items,
  [],
  'a list still loading is never filled with only the held line',
);
const loaded = shoppingReducer(loading, setShopping([]));
assert.deepEqual(
  loaded.items.map((item) => item.id),
  ['milk'],
  'and shows it once the list has delivered without it',
);
const retried = shoppingReducer(loaded, toHold('eggs', 't'));
assert.deepEqual(
  retried.items.map((item) => item.id),
  ['eggs'],
  'a retried transaction’s holds replace its earlier attempt’s',
);
const settled = shoppingReducer(retried, settlePinchWrites('t'));
assert.notEqual(settled.hold.held[0].settledAt, null);
assert.deepEqual(
  shoppingReducer(settled, setShopping([{ ...milk, id: 'eggs' }])).hold.held,
  [],
  'a settled hold lets go when the list shows it',
);

const windowKey = '2026-11';
const { start, end } = getMonthWindow(windowKey);
const meal = { id: 'm', date: start } as PlannedMeal;
const moved = { ...meal, date: end + 86_400_000 } as PlannedMeal;
const planned = plannedMealsReducer(
  plannedMealsReducer(undefined, setPlannedMeals({ windowKey, items: [meal] })),
  holdPinchWrites({
    token: 'p',
    writes: {
      plannedMeals: [
        {
          id: 'm',
          item: moved,
          fingerprint: JSON.stringify({ date: moved.date }),
          token: 'p',
          settledAt: null,
          fields: ['date'],
        },
      ],
    },
  }),
);
assert.deepEqual(
  planned.items,
  [],
  'a meal moved past the loaded months leaves them at once',
);

console.log('pinch held lists: ok');
